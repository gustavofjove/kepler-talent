using FastEndpoints;
using FastEndpoints.Swagger;
using KeplerTalento.Application;
using KeplerTalento.Application.Abstractions.Correlation;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Infrastructure;
using KeplerTalento.Web.Correlation;
using KeplerTalento.Web.Errors;
using KeplerTalento.Web.Features.Admin;
using KeplerTalento.Web.Features.Audit;
using KeplerTalento.Web.Features.Candidates;
using KeplerTalento.Web.Features.Catalogs;
using KeplerTalento.Web.Features.Documents;
using KeplerTalento.Web.Features.Import;
using KeplerTalento.Web.Features.Search;
using KeplerTalento.Web.Health;
using KeplerTalento.Web.Identity;
using KeplerTalento.Web.Observability;
using KeplerTalento.Infrastructure.Persistence;
using KeplerTalento.Infrastructure.Documents;
using KeplerTalento.Infrastructure.Encryption;
using KeplerTalento.Web.Features.Identity;
using KeplerTalento.Web.Features.Positions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using NJsonSchema;
using NSwag;
using NSwag.Generation.Processors;
using Serilog;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog((context, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    // Registered last so it sees every property the other enrichers added, and applies to
    // every sink. Candidate personal data must not reach a log whichever slice, library or
    // unhandled exception put it in the event.
    .Enrich.With<PersonalDataRedactionEnricher>()
    .WriteTo.Console());

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = DocumentStorageOptions.AbsoluteMaximumBytes + DocumentStorageOptions.MultipartEnvelopeBytes);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
    options.MultipartBodyLengthLimit = DocumentStorageOptions.AbsoluteMaximumBytes + DocumentStorageOptions.MultipartEnvelopeBytes);
builder.Services.AddFastEndpoints();
builder.Services.SwaggerDocument(settings =>
{
    // The API takes a bearer token since KTL-16, so the document says so and Swagger UI can
    // carry one.
    settings.EnableJWTBearerAuth = true;
    settings.DocumentSettings = document =>
    {
        document.Title = "Kepler Talento API";
        document.Version = "v1";
        document.OperationProcessors.Add(new OperationProcessor(context =>
        {
            context.OperationDescription.Operation.Parameters.Add(new OpenApiParameter
            {
                Name = CorrelationMiddleware.HeaderName,
                Kind = OpenApiParameterKind.Header,
                Type = JsonObjectType.String,
                IsRequired = false,
                Description = "Optional caller correlation identifier; a safe identifier is generated when absent or invalid.",
            });
            return true;
        }));
    };
});
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseReadinessHealthCheck>("database", tags: ["ready"])
    .AddCheck<StorageReadinessHealthCheck>("storage", tags: ["ready"])
    .AddCheck<ScannerHealthCheck>("scanner", tags: ["scanner"]);
builder.Services.AddOptions<DevelopmentActorOptions>()
    .Bind(builder.Configuration.GetSection(DevelopmentActorOptions.SectionName))
    .Validate(
        options => !builder.Environment.IsProduction() || !options.Enabled,
        "DevelopmentActor cannot be enabled in Production.")
    .ValidateOnStart();

builder.Services.AddOptions<KeplerAuthenticationOptions>()
    .Bind(builder.Configuration.GetSection(KeplerAuthenticationOptions.SectionName))
    .Validate(
        // The dev issuer is a way to mint a token for any subject you name. In Production that
        // is not a convenience, it is an unauthenticated path to any identity.
        options => !builder.Environment.IsProduction() || options.DevelopmentIssuer?.Enabled != true,
        "Authentication:DevelopmentIssuer cannot be enabled in Production.")
    .Validate(
        options => !string.IsNullOrWhiteSpace(options.SubjectClaim),
        "Authentication:SubjectClaim is required.")
    .ValidateOnStart();

var authenticationOptions = builder.Configuration.GetSection(KeplerAuthenticationOptions.SectionName)
    .Get<KeplerAuthenticationOptions>() ?? new();
var developmentIssuer = authenticationOptions.DevelopmentIssuer;
var developmentIssuerEnabled = developmentIssuer?.Enabled == true && !builder.Environment.IsProduction();
if (builder.Environment.IsProduction() && developmentIssuer?.Enabled == true)
{
    throw new InvalidOperationException("Authentication:DevelopmentIssuer cannot be enabled in Production.");
}
// KTL-45. Thrown here rather than left to ValidateOnStart, because --migrate builds the app but
// never starts it, and the seed must not run with options start-up would have refused.
if (LocalAccountDefaults.Problem(authenticationOptions, builder.Environment.IsProduction()) is { } localAccountsProblem)
{
    throw new InvalidOperationException(localAccountsProblem);
}
var localAccounts = authenticationOptions.LocalAccounts;
var localAccountsEnabled = localAccounts?.Enabled == true;

var developmentActorOptions = builder.Configuration.GetSection(DevelopmentActorOptions.SectionName)
    .Get<DevelopmentActorOptions>() ?? new();

// A branch, never a chain. Whichever of the two is registered is the only ICurrentActor there
// is, which is what makes "an absent or invalid token never resolves to the development actor"
// a property of the composition rather than an assertion about a fallback (design D11).
if (developmentActorOptions.Enabled)
{
    builder.Services.AddScoped<DevelopmentActor>();
    builder.Services.AddScoped<ICurrentActor>(provider => provider.GetRequiredService<DevelopmentActor>());
}
else
{
    builder.Services.AddScoped<TokenCurrentActor>();
    builder.Services.AddScoped<ICurrentActor>(provider => provider.GetRequiredService<TokenCurrentActor>());
    builder.Services.AddScoped<CallerIdentityResolver>();
}

if (developmentIssuerEnabled)
{
    builder.Services.AddSingleton<DevelopmentTokenIssuer>();
}
if (localAccountsEnabled)
{
    builder.Services.AddSingleton<LocalAccountTokenIssuer>();
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Signing keys come from the discovery document and refresh on their own, which is what
        // survives a key rotation at the provider without restarting the API (design D1).
        options.Authority = authenticationOptions.Authority;
        options.Audience = authenticationOptions.Audience;
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            // 60 seconds rather than the five-minute default: a token just outside its window
            // is refused, and the scenario the specs name is clock skew, not a grace period.
            ClockSkew = TimeSpan.FromSeconds(60),
        };

        // The dev issuer and the local-account issuer (KTL-45) are trusted *in addition to* the
        // tenant, and their tokens go through this same pipeline. Nothing here weakens
        // validation; each adds one more issuer and one more key that a signature must match,
        // and the binding below keeps each key to its own issuer.
        var binding = new IssuerKeyBinding();
        var issuers = new List<string>();
        var audiences = new List<string>();
        var keys = new List<SecurityKey>();
        if (developmentIssuerEnabled)
        {
            var key = DevelopmentTokenIssuer.SigningKey(developmentIssuer!);
            issuers.Add(developmentIssuer!.Issuer);
            audiences.Add(developmentIssuer.Audience);
            keys.Add(key);
            binding.Bind(developmentIssuer.Issuer, key);
        }
        if (localAccountsEnabled)
        {
            var key = LocalAccountTokenIssuer.SigningKey(localAccounts!);
            issuers.Add(localAccounts!.Issuer);
            audiences.Add(localAccounts.Audience);
            keys.Add(key);
            binding.Bind(localAccounts.Issuer, key);
        }
        if (!binding.IsEmpty)
        {
            if (!string.IsNullOrWhiteSpace(authenticationOptions.Authority))
            {
                issuers.Add(authenticationOptions.Authority!);
            }
            if (!string.IsNullOrWhiteSpace(authenticationOptions.Audience))
            {
                audiences.Add(authenticationOptions.Audience!);
            }
            options.TokenValidationParameters.ValidIssuers = issuers;
            options.TokenValidationParameters.ValidAudiences = audiences;
            options.TokenValidationParameters.IssuerSigningKeys = keys;
            // A key is looked up by the token's kid and never by trying every key, and a bound
            // key vouches only for the issuer it belongs to.
            options.TokenValidationParameters.TryAllIssuerSigningKeys = false;
            options.TokenValidationParameters.IssuerSigningKeyValidatorUsingConfiguration =
                (key, token, _, _) => binding.Allows(key, token.Issuer);
            // Without an authority there is no discovery document to fetch, and asking for one
            // would make start-up depend on a tenant the developer does not have. With one, only
            // development relaxes the HTTPS requirement on fetching it.
            if (developmentIssuerEnabled)
            {
                options.RequireHttpsMetadata = false;
            }
            if (string.IsNullOrWhiteSpace(authenticationOptions.Authority))
            {
                options.RequireHttpsMetadata = false;
                options.Authority = null;
                options.TokenValidationParameters.ValidateIssuerSigningKey = true;
            }
        }
    });
builder.Services.AddAuthorization(options =>
{
    // Every endpoint requires an authenticated caller unless it opts out with AllowAnonymous,
    // which only health and the development token issuer do. A fallback policy rather than
    // .RequireAuthorization() per group because the default must be "refused": a business
    // endpoint group added later without an authorization line then fails closed instead of
    // being silently open.
    //
    // It is not applied when the development actor is registered, because there is no token to
    // authenticate in that mode and the handler guards are what decide. That mode cannot exist
    // in Production - start-up fails - so no deployment reaches this with the fallback off.
    if (!developmentActorOptions.Enabled)
    {
        options.FallbackPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .Build();
    }

    // Endpoint policies run before minimal-API body binding. The handlers repeat these guards,
    // but a handler-only check is too late for malformed JSON: model binding would disclose a
    // 400 to a caller who should learn only that administration is forbidden (design D6).
    options.AddPolicy(Permissions.UsersManage, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.UsersManage)));
    options.AddPolicy(Permissions.RolesManage, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.RolesManage)));
    // KTL-17. Before the multipart form is read, so an unauthorized upload's bytes are never
    // parsed or stored, and before body binding, so a malformed request is refused identically.
    options.AddPolicy(Permissions.CandidatesImport, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.CandidatesImport)));
    // KTL-19. Before query binding, so a malformed filter from an unauthorized caller is refused
    // identically to a valid one.
    options.AddPolicy(Permissions.AuditRead, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.AuditRead)));
    options.AddPolicy(Permissions.PositionsRead, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.PositionsRead)));
    options.AddPolicy(Permissions.PositionsManage, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.PositionsManage)));
    // KTL-30. Position candidate links name people, so each also requires candidates.read.
    options.AddPolicy(PositionCandidateEndpoints.ReadPolicy, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.PositionsRead)
        && actor.HasPermission(Permissions.CandidatesRead)));
    options.AddPolicy(PositionCandidateEndpoints.ManagePolicy, policy => policy.RequireAssertion(context =>
        context.Resource is HttpContext httpContext
        && httpContext.RequestServices.GetRequiredService<ICurrentActor>() is { } actor
        && actor.IsAuthenticated
        && actor.HasPermission(Permissions.PositionsManage)
        && actor.HasPermission(Permissions.CandidatesRead)));
});
// KTL-45 design D5. Per client address, after UseForwardedHeaders has resolved it from the
// trusted proxy. Attached to the password sign-in endpoint only. There is no lockout per user
// name on purpose: with shared generic accounts it would let anyone lock HR out.
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy(PasswordSignInEndpoints.RateLimitPolicy, httpContext =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = localAccounts?.SignInAttemptsPerMinute ?? 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    // The same ProblemDetails shape every other refusal has, written by the same handler rather
    // than by hand, with the wait the window actually imposes.
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        var handler = context.HttpContext.RequestServices
            .GetServices<Microsoft.AspNetCore.Diagnostics.IExceptionHandler>()
            .OfType<GlobalExceptionHandler>()
            .Single();
        await handler.TryHandleAsync(
            context.HttpContext,
            new KeplerTalento.Application.Common.Errors.TooManyRequestsException(
                "auth.too_many_attempts",
                "Demasiados intentos. Espere un minuto y vuelva a intentarlo."),
            cancellationToken);
    };
});
builder.Services.AddSingleton<CvDraftGate>();
builder.Services.AddScoped<CorrelationContext>();
builder.Services.AddScoped<ICorrelationContext>(provider => provider.GetRequiredService<CorrelationContext>());
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    var trustedNetworks = builder.Configuration.GetSection("ProxyTrust:KnownNetworks").Get<string[]>() ?? [];
    if (trustedNetworks.Length == 0)
    {
        throw new InvalidOperationException("ProxyTrust:KnownNetworks must contain at least one explicit CIDR.");
    }
    foreach (var trustedNetwork in trustedNetworks)
    {
        if (!System.Net.IPNetwork.TryParse(trustedNetwork, out var network))
        {
            throw new InvalidOperationException("ProxyTrust:KnownNetworks contains an invalid CIDR.");
        }
        options.KnownIPNetworks.Add(network);
    }
});

var actorOptions = builder.Configuration.GetSection(DevelopmentActorOptions.SectionName).Get<DevelopmentActorOptions>() ?? new();
if (builder.Environment.IsProduction() && actorOptions.Enabled)
{
    throw new InvalidOperationException("DevelopmentActor cannot be enabled in Production.");
}

// Every uploaded file would be promoted unscanned. Acceptable on a test server with fabricated
// data, never where real CVs arrive.
var scannerBypass = builder.Configuration.GetSection(ClamAvOptions.SectionName).Get<ClamAvOptions>()?.Bypass == true;
if (builder.Environment.IsProduction() && scannerBypass)
{
    throw new InvalidOperationException("ClamAv:Bypass cannot be enabled in Production.");
}

var app = builder.Build();
if (args.Contains("--reconcile", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    var reconciler = scope.ServiceProvider.GetRequiredService<DocumentStorageReconciler>();
    var report = await reconciler.ReconcileAsync(TimeSpan.FromHours(24), app.Lifetime.ApplicationStopping);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(report));
    if (!report.IsSuccessful) Environment.ExitCode = 2;
    return;
}
if (args.Contains("--purge-imports", StringComparer.Ordinal))
{
    // The same purge the worker schedules, runnable on demand the way --reconcile is.
    await using var scope = app.Services.CreateAsyncScope();
    var purge = scope.ServiceProvider.GetRequiredService<KeplerTalento.Infrastructure.Import.ImportPurgeHandler>();
    var report = await purge.PurgeAsync(DateTimeOffset.UtcNow, app.Lifetime.ApplicationStopping);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(report));
    return;
}
if (args.Contains("--migrate", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await DatabaseInitializer.MigrateAsync(dbContext, app.Lifetime.ApplicationStopping);
    await DatabaseInitializer.SeedCatalogsAsync(dbContext, app.Lifetime.ApplicationStopping);
    // Throws when the installation would be left with nobody able to administer it. Deploying on
    // into a locked-out installation is the failure this is here to prevent, so it fails the
    // migrator rather than logging a warning nobody reads.
    var seedBootstrapAdministrator = () => DatabaseInitializer.SeedBootstrapAdministratorAsync(
        dbContext,
        authenticationOptions.BootstrapAdministrator?.Email,
        authenticationOptions.BootstrapAdministrator?.DisplayName,
        app.Lifetime.ApplicationStopping);
    // KTL-45. With a bootstrap address configured it is seeded first, exactly as before, so a
    // fresh database still gets that administrator even though a seeded local admin follows.
    // Without one, the local accounts go first and the bootstrap step is only the lockout check.
    var bootstrapConfigured = !string.IsNullOrWhiteSpace(authenticationOptions.BootstrapAdministrator?.Email);
    if (bootstrapConfigured)
    {
        await seedBootstrapAdministrator();
    }
    // Keyed on the seed list, not on Enabled: the migrator holds the passwords and the API holds
    // the signing key, and neither container needs the other's secret.
    if (localAccounts is { Seed.Length: > 0 })
    {
        await DatabaseInitializer.SeedLocalAccountsAsync(
            dbContext,
            scope.ServiceProvider.GetRequiredService<IPasswordHasher>(),
            localAccounts.Seed
                .Select(seed => new LocalAccountSeed(seed.UserName, seed.DisplayName, seed.Email, seed.RoleName, seed.Password))
                .ToList(),
            app.Environment.IsProduction() ? LocalAccountDefaults.DevelopmentOnlyValues : new HashSet<string>(),
            app.Lifetime.ApplicationStopping);
    }
    if (!bootstrapConfigured)
    {
        await seedBootstrapAdministrator();
    }
    return;
}
// KTL-33: the serving path refuses to start without valid keys, while any encrypted column still
// holds plaintext, or while the legacy staging schema exists. Placed after the --migrate branch
// on purpose: the migrator never holds the keys.
await using (var encryptionScope = app.Services.CreateAsyncScope())
{
    await FieldEncryptionStartupCheck.RunAsync(
        encryptionScope.ServiceProvider.GetRequiredService<AesGcmFieldProtector>(),
        encryptionScope.ServiceProvider.GetRequiredService<ApplicationDbContext>(),
        app.Lifetime.ApplicationStopping);
}
if (scannerBypass)
{
    app.Logger.LogWarning("ClamAv:Bypass is on: uploaded files are marked clean without a malware scan.");
}

app.UseForwardedHeaders();
app.UseMiddleware<CorrelationMiddleware>();
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
    await next();
});
app.UseSerilogRequestLogging(options =>
{
    options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
});
// After the correlation middleware and the security headers, so a 429 carries both, and before
// the endpoint, so a refused attempt never reaches the password check (KTL-45 design D5).
app.UseRateLimiter();
// After the correlation middleware, so a refused request still carries a correlation id, and
// before endpoint dispatch (design D1).
app.UseAuthentication();
// DevelopmentActor is a local convenience for requests carrying no credentials, never a
// fallback for a bad credential. If a caller presents a bearer token, authentication must have
// accepted it; otherwise refuse before any handler can see the synthetic actor.
if (developmentActorOptions.Enabled)
{
    app.Use(async (context, next) =>
    {
        var carriesBearer = context.Request.Headers.Authorization
            .Any(value => value?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true);
        if (carriesBearer && context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        await next();
    });
}
// Turns the validated token into the ICurrentActor the handler guards consult. Between
// authentication and authorization, because it is the step that decides what the caller may do.
// Part of the token branch: in development-actor mode there is no token to resolve, and the
// resolver it depends on is not registered (design D11).
if (!developmentActorOptions.Enabled)
{
    app.UseMiddleware<IdentityResolutionMiddleware>();
}
app.UseAuthorization();
app.UseFastEndpoints();
app.MapGet("/api/health/live", () => Results.Ok(new { status = "healthy" })).WithTags("Health")
    .AllowAnonymous();
app.MapGet("/api/health/ready", async (
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckService healthChecks,
        CancellationToken cancellationToken) =>
    {
        var report = await healthChecks.CheckHealthAsync(
            registration => registration.Tags.Contains("ready"),
            cancellationToken);
        return report.Status == Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Healthy
            ? Results.Ok(new { status = "healthy" })
            : Results.Json(new { status = "unhealthy" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    })
    .WithTags("Health")
    .AllowAnonymous()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status503ServiceUnavailable);
app.MapGet("/api/health/scanner", async (
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckService healthChecks,
        CancellationToken cancellationToken) =>
    {
        var report = await healthChecks.CheckHealthAsync(
            registration => registration.Tags.Contains("scanner"),
            cancellationToken);
        return report.Status == Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Healthy
            ? Results.Ok(new { status = "healthy" })
            : Results.Json(new { status = "degraded" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    })
    .WithTags("Health")
    .AllowAnonymous()
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status503ServiceUnavailable);
app.MapCatalogEndpoints();
app.MapCandidateEndpoints();
app.MapCandidateDraftEndpoints();
app.MapDocumentEndpoints();
app.MapImportEndpoints();
app.MapSearchEndpoints();
app.MapAdminEndpoints();
app.MapAuditEndpoints();
app.MapPositionEndpoints();
app.MapPositionCandidateEndpoints();
app.MapMeEndpoints();
if (developmentIssuerEnabled)
{
    // Anonymous by necessity - it is how a caller acquires a token - and therefore mapped only
    // outside Production, where start-up would already have failed.
    app.MapDevelopmentTokenEndpoints();
}
if (localAccountsEnabled)
{
    // Anonymous too, but a credential check rather than a token for the asking, which is why it
    // may exist in Production (KTL-45). Unmapped - a 404 - when local accounts are off.
    app.MapPasswordSignInEndpoints();
}
if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.UseSwaggerGen();
}
app.Run();

public partial class Program;

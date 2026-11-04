using KeplerTalento.Application.Abstractions.Persistence;
using KeplerTalento.Infrastructure.Persistence;
using KeplerTalento.Application.Abstractions.CvExtraction;
using KeplerTalento.Application.Abstractions.Documents;
using KeplerTalento.Application.Abstractions.Import;
using KeplerTalento.Application.Abstractions.Operations;
using KeplerTalento.Application.Abstractions.Encryption;
using KeplerTalento.Application.Abstractions.Identity;
using KeplerTalento.Infrastructure.CvExtraction;
using KeplerTalento.Infrastructure.Identity;
using KeplerTalento.Infrastructure.Encryption;
using KeplerTalento.Infrastructure.Documents;
using KeplerTalento.Infrastructure.Import;
using KeplerTalento.Infrastructure.Operations;
using KeplerTalento.Application.Abstractions.Positions;
using KeplerTalento.Infrastructure.Positions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace KeplerTalento.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("ApplicationDatabase")
            ?? throw new InvalidOperationException("ConnectionStrings:ApplicationDatabase is required.");
        services.AddFieldEncryption();
        services.AddDbContext<ApplicationDbContext>((provider, options) => options
            .UseNpgsql(connectionString)
            .UseFieldEncryption(provider.GetRequiredService<IFieldProtector>(), provider.GetRequiredService<IBlindIndex>()));
        services.AddScoped<ICandidateRepository, CandidateRepository>();
        services.AddScoped<IDocumentRepository, DocumentRepository>();
        services.AddScoped<ICatalogRepository, CatalogRepository>();
        services.AddScoped<ISearchPresetRepository, SearchPresetRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRoleRepository, RoleRepository>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddScoped<IImportBatchRepository, ImportBatchRepository>();
        services.AddScoped<IAuditRepository, AuditRepository>();
        services.AddScoped<IPositionRepository, PositionRepository>();
        services.AddSingleton<IPositionDescriptionSanitizer, PositionDescriptionSanitizer>();
        var storageOptions = configuration.GetSection(DocumentStorageOptions.SectionName).Get<DocumentStorageOptions>()
            ?? throw new InvalidOperationException("DocumentStorage configuration is required.");
        FileSystemDocumentStorage.ValidateAndPrepare(storageOptions);
        var scannerOptions = configuration.GetSection(ClamAvOptions.SectionName).Get<ClamAvOptions>() ?? new();
        var workerOptions = configuration.GetSection(OperationWorkerOptions.SectionName).Get<OperationWorkerOptions>() ?? new();
        if (string.IsNullOrWhiteSpace(scannerOptions.Host) || scannerOptions.Port is < 1 or > 65535 || scannerOptions.TimeoutSeconds is < 1 or > 600)
        {
            throw new InvalidOperationException("ClamAV configuration is unsafe.");
        }
        if (workerOptions.PollSeconds is < 1 or > 300 || workerOptions.LeaseSeconds is < 5 or > 3600)
        {
            throw new InvalidOperationException("Operation worker configuration is unsafe.");
        }
        var importOptions = configuration.GetSection(ImportOptions.SectionName).Get<ImportOptions>() ?? new();
        importOptions.Validate();
        services.AddSingleton(storageOptions);
        services.AddSingleton(importOptions);
        services.AddSingleton(scannerOptions);
        services.AddSingleton(workerOptions);
        services.AddSingleton<IDocumentStorage, FileSystemDocumentStorage>();
        services.AddSingleton<IDocumentStorageInventory>(provider =>
            (FileSystemDocumentStorage)provider.GetRequiredService<IDocumentStorage>());
        services.AddSingleton<IDocumentContentInspector, DocumentContentInspector>();
        services.AddSingleton<IDocumentStorageKeyFactory, DocumentStorageKeyFactory>();
        // Program.cs refuses the bypass in Production before this registration is ever used.
        if (scannerOptions.Bypass)
        {
            services.AddSingleton<IMalwareScanner, BypassMalwareScanner>();
        }
        else
        {
            services.AddSingleton<IMalwareScanner, ClamAvScanner>();
        }
        services.AddScoped<IDocumentDownloadService, DocumentDownloadService>();
        services.AddScoped<ScanOperationHandler>();
        services.AddScoped<IOperationHandler>(provider => provider.GetRequiredService<ScanOperationHandler>());
        services.AddSingleton<IImportFileStorage, ImportFileStorage>();
        services.AddSingleton<IImportFileInspector, ImportFileInspector>();
        services.AddSingleton<IImportRowReader, CsvImportRowReader>();
        services.AddScoped<ImportRunSupport>();
        services.AddScoped<ImportScanHandler>();
        services.AddScoped<ImportValidationHandler>();
        services.AddScoped<ImportCommitHandler>();
        services.AddScoped<ImportPurgeHandler>();
        services.AddScoped<IOperationHandler>(provider => provider.GetRequiredService<ImportScanHandler>());
        services.AddScoped<IOperationHandler>(provider => provider.GetRequiredService<ImportValidationHandler>());
        services.AddScoped<IOperationHandler>(provider => provider.GetRequiredService<ImportCommitHandler>());
        services.AddScoped<IOperationHandler>(provider => provider.GetRequiredService<ImportPurgeHandler>());
        var cvDraftOptions = configuration.GetSection(CvDraftOptions.SectionName).Get<CvDraftOptions>() ?? new();
        cvDraftOptions.Validate();
        services.AddSingleton(cvDraftOptions);
        services.AddSingleton(_ => new SpanishPlaces());
        services.AddSingleton<PdfCvTextReader>();
        services.AddSingleton<DocxCvTextReader>();
        services.AddSingleton<ICvTextReader>(provider => new CvTextReader(
            provider.GetRequiredService<PdfCvTextReader>(),
            provider.GetRequiredService<DocxCvTextReader>(),
            cvDraftOptions));
        services.AddSingleton<ICandidateDraftExtractor, RuleBasedCandidateDraftExtractor>();
        services.AddScoped<DocumentStorageReconciler>();
        services.AddScoped<IOperationRepository, PostgreSqlOperationRepository>();
        services.AddHostedService<DurableOperationWorker>();
        services.AddHostedService<ImportMaintenanceService>();
        return services;
    }

    /// <summary>
    /// Field encryption (KTL-33). Keys are read on first use, so registering them never fails;
    /// the serving path validates them at startup and refuses to run without them.
    /// </summary>
    public static IServiceCollection AddFieldEncryption(this IServiceCollection services)
    {
        // Resolved from the final configuration, not the one visible at registration time, so a
        // host's configuration overrides reach it.
        services.AddSingleton(provider =>
            provider.GetRequiredService<IConfiguration>().GetSection(FieldEncryptionOptions.SectionName).Get<FieldEncryptionOptions>()
            ?? new FieldEncryptionOptions());
        services.AddSingleton(provider =>
        {
            var options = provider.GetRequiredService<FieldEncryptionOptions>();
            return new Lazy<FieldKeySet>(() => FieldKeySet.Load(options.KeyFile), LazyThreadSafetyMode.ExecutionAndPublication);
        });
        services.AddSingleton(provider =>
        {
            var keys = provider.GetRequiredService<Lazy<FieldKeySet>>();
            return new AesGcmFieldProtector(() => keys.Value);
        });
        services.AddSingleton<IFieldProtector>(provider => provider.GetRequiredService<AesGcmFieldProtector>());
        services.AddSingleton<IBlindIndex>(provider =>
        {
            var keys = provider.GetRequiredService<Lazy<FieldKeySet>>();
            return new HmacBlindIndex(() => keys.Value);
        });
        return services;
    }
}

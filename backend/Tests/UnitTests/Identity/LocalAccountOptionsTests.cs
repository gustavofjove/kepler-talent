using System.IdentityModel.Tokens.Jwt;
using KeplerTalento.Application.Features.Identity;
using KeplerTalento.Web.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace KeplerTalento.Tests.UnitTests.Identity;

public sealed class LocalAccountOptionsTests
{
    private const string LocalKey = "a-local-accounts-signing-key-of-at-least-32-bytes";
    private const string DevelopmentKey = "a-development-issuer-signing-key-of-32-bytes-too";

    [Fact]
    public void Disabled_local_accounts_need_no_key()
    {
        Assert.Null(LocalAccountDefaults.Problem(Options(new LocalAccountsOptions { Enabled = false }), isProduction: true));
    }

    [Fact]
    public void A_safe_configuration_passes_in_production()
    {
        Assert.Null(LocalAccountDefaults.Problem(Options(Local(LocalKey)), isProduction: true));
    }

    [Fact]
    public void A_short_key_is_refused()
    {
        Assert.Contains("32 bytes", LocalAccountDefaults.Problem(Options(Local("too-short")), isProduction: false));
    }

    [Fact]
    public void Reusing_the_development_key_is_refused()
    {
        var problem = LocalAccountDefaults.Problem(Options(Local(DevelopmentKey), developmentKey: DevelopmentKey), isProduction: false);

        Assert.Contains("differ", problem);
    }

    [Fact]
    public void Reusing_the_development_issuer_name_is_refused()
    {
        var options = new KeplerAuthenticationOptions
        {
            DevelopmentIssuer = new DevelopmentIssuerOptions { SigningKey = DevelopmentKey, Issuer = "same" },
            LocalAccounts = new LocalAccountsOptions { Enabled = true, SigningKey = LocalKey, Issuer = "same" },
        };

        Assert.Contains("Issuer", LocalAccountDefaults.Problem(options, isProduction: false));
    }

    [Fact]
    public void The_committed_development_key_is_refused_only_in_production()
    {
        const string committed = "development-only-local-accounts-key-change-me-32b";

        Assert.Null(LocalAccountDefaults.Problem(Options(Local(committed)), isProduction: false));
        Assert.Contains("development-only", LocalAccountDefaults.Problem(Options(Local(committed)), isProduction: true));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1441)]
    public void An_out_of_range_lifetime_is_refused(int minutes)
    {
        var local = new LocalAccountsOptions { Enabled = true, SigningKey = LocalKey, TokenLifetimeMinutes = minutes };

        Assert.NotNull(LocalAccountDefaults.Problem(Options(local), isProduction: false));
    }

    [Fact]
    public void The_issued_token_names_the_account_and_nothing_it_may_do()
    {
        var issuer = new LocalAccountTokenIssuer(Microsoft.Extensions.Options.Options.Create(Options(Local(LocalKey))));
        var user = new SignedInUser(Guid.CreateVersion7(), "local:rrhh_user", "RRHH Usuario", "rrhh.user@kepler-talento.local");

        var token = new JwtSecurityTokenHandler().ReadJwtToken(issuer.Issue(user));

        Assert.Equal(LocalAccountTokenIssuer.KeyId, token.Header.Kid);
        Assert.Equal("https://kepler-talento.local/accounts", token.Issuer);
        Assert.Equal("local:rrhh_user", token.Claims.Single(claim => claim.Type == "oid").Value);
        Assert.Equal(
            ["aud", "email", "exp", "iss", "name", "nbf", "oid"],
            token.Claims.Select(claim => claim.Type).Distinct().Order(StringComparer.Ordinal));
        Assert.InRange(token.ValidTo - token.ValidFrom, TimeSpan.FromMinutes(479), TimeSpan.FromMinutes(481));
        Assert.Equal(480 * 60, issuer.LifetimeSeconds);
    }

    [Fact]
    public void A_bound_key_vouches_only_for_its_own_issuer()
    {
        var binding = new IssuerKeyBinding();
        var local = new SymmetricSecurityKey(new byte[32]) { KeyId = LocalAccountTokenIssuer.KeyId };
        var development = new SymmetricSecurityKey(new byte[32]) { KeyId = DevelopmentTokenIssuer.KeyId };
        var provider = new SymmetricSecurityKey(new byte[32]) { KeyId = "provider-key" };
        binding.Bind("local-issuer", local);
        binding.Bind("dev-issuer", development);

        Assert.True(binding.Allows(local, "local-issuer"));
        Assert.True(binding.Allows(development, "dev-issuer"));
        Assert.False(binding.Allows(development, "local-issuer"));
        Assert.False(binding.Allows(local, "dev-issuer"));
        Assert.False(binding.Allows(provider, "local-issuer"));
        Assert.True(binding.Allows(provider, "https://login.example/tenant"));
    }

    private static LocalAccountsOptions Local(string key) => new() { Enabled = true, SigningKey = key };

    private static KeplerAuthenticationOptions Options(LocalAccountsOptions local, string developmentKey = DevelopmentKey) => new()
    {
        DevelopmentIssuer = new DevelopmentIssuerOptions { SigningKey = developmentKey },
        LocalAccounts = local,
    };
}

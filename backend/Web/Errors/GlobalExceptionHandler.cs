using KeplerTalento.Application.Common.Errors;
using KeplerTalento.Web.Correlation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace KeplerTalento.Web.Errors;

public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (status, title, code) = exception switch
        {
            RequestValidationException validation => (StatusCodes.Status400BadRequest, "Solicitud no válida", validation.Code),
            InvalidCredentialsException invalid => (StatusCodes.Status401Unauthorized, "Credenciales no válidas", invalid.Code),
            ForbiddenException forbidden => (StatusCodes.Status403Forbidden, "Acceso denegado", forbidden.Code),
            NotFoundException notFound => (StatusCodes.Status404NotFound, "Recurso no encontrado", notFound.Code),
            ConflictException conflict => (StatusCodes.Status409Conflict, "Conflicto de concurrencia", conflict.Code),
            UnprocessableException unprocessable => (StatusCodes.Status422UnprocessableEntity, "Contenido no procesable", unprocessable.Code),
            TooManyRequestsException busy => (StatusCodes.Status429TooManyRequests, "Demasiadas solicitudes", busy.Code),
            ServiceUnavailableException unavailable => (StatusCodes.Status503ServiceUnavailable, "Servicio no disponible", unavailable.Code),
            _ => (StatusCodes.Status500InternalServerError, "Error inesperado", "server.unexpected"),
        };
        // A known unavailable dependency is an expected, retryable refusal, not an unhandled failure.
        var unexpected = status >= 500 && exception is not ServiceUnavailableException;
        if (unexpected)
        {
            logger.LogError(exception, "Unhandled request failure with code {ErrorCode}", code);
        }
        if (exception is TooManyRequestsException)
        {
            // A caller that knows the real wait (the sign-in rate limiter) has already said so.
            if (string.IsNullOrEmpty(httpContext.Response.Headers.RetryAfter))
            {
                httpContext.Response.Headers.RetryAfter = "5";
            }
        }
        else if (exception is ServiceUnavailableException)
        {
            httpContext.Response.Headers.RetryAfter = "30";
        }
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = unexpected ? "Se ha producido un error inesperado." : exception.Message,
            Instance = httpContext.Request.Path,
        };
        problem.Extensions["code"] = code;
        var correlationId = httpContext.RequestServices.GetRequiredService<CorrelationContext>().CorrelationId;
        httpContext.Response.Headers[CorrelationMiddleware.HeaderName] = correlationId;
        problem.Extensions["correlationId"] = correlationId;
        if (exception is RequestValidationException validationException)
        {
            problem.Extensions["errors"] = validationException.Issues;
        }
        httpContext.Response.StatusCode = status;
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}

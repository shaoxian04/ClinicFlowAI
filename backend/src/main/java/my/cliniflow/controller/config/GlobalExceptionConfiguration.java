package my.cliniflow.controller.config;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.UpstreamException;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.domain.biz.schedule.service.exception.BookingsInWindowException;
import my.cliniflow.domain.biz.schedule.service.exception.CancelWindowPassedException;
import my.cliniflow.domain.biz.schedule.service.exception.SlotTakenException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.NoSuchElementException;

@RestControllerAdvice
public class GlobalExceptionConfiguration {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionConfiguration.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<WebResult<Void>> onValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .orElse(ResultCode.BAD_REQUEST.defaultMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(WebResult.error(ResultCode.BAD_REQUEST, message));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<WebResult<Void>> onUnauthenticated(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(WebResult.error(ResultCode.UNAUTHORIZED, ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<WebResult<Void>> onForbidden(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(WebResult.error(ResultCode.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<WebResult<Void>> onNotFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(WebResult.error(ResultCode.NOT_FOUND, "not found"));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<WebResult<Void>> onNoSuchElement(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(WebResult.error(ResultCode.NOT_FOUND, ex.getMessage() != null ? ex.getMessage() : "not found"));
    }

    @ExceptionHandler(UpstreamException.class)
    public ResponseEntity<WebResult<Void>> onUpstream(UpstreamException ex) {
        log.error("[UPSTREAM] {} body={}", ex.getMessage(), ex.upstreamBody());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
            .body(WebResult.error(ResultCode.UPSTREAM_UNAVAILABLE, ex.getMessage()));
    }

    @ExceptionHandler(WebClientResponseException.class)
    public ResponseEntity<WebResult<Void>> onWebClientError(WebClientResponseException ex) {
        log.error("[WEBCLIENT] HTTP {} body={}", ex.getRawStatusCode(), ex.getResponseBodyAsString());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
            .body(WebResult.error(ResultCode.UPSTREAM_UNAVAILABLE,
                "upstream HTTP " + ex.getRawStatusCode()));
    }

    @ExceptionHandler(SlotTakenException.class)
    public ResponseEntity<WebResult<Void>> onSlotTaken(SlotTakenException ex) {
        log.info("[SCHEDULE] slot taken: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(WebResult.error(ResultCode.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(BookingsInWindowException.class)
    public ResponseEntity<WebResult<Void>> onBookingsInWindow(BookingsInWindowException ex) {
        log.info("[SCHEDULE] bookings conflict window/day: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(WebResult.error(ResultCode.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(CancelWindowPassedException.class)
    public ResponseEntity<WebResult<Void>> onCancelWindowPassed(CancelWindowPassedException ex) {
        log.info("[SCHEDULE] cancel window passed: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(WebResult.error(ResultCode.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<WebResult<Void>> onBusiness(BusinessException ex) {
        HttpStatus status = statusFor(ex.resultCode());
        if (status.is5xxServerError()) {
            log.error("[BIZ] {}: {}", ex.resultCode(), ex.getMessage(), ex);
        } else {
            log.info("[BIZ] {}: {}", ex.resultCode(), ex.getMessage());
        }
        return ResponseEntity.status(status)
            .body(WebResult.error(ex.resultCode(), ex.getMessage()));
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<WebResult<Void>> onFileTooLarge(
            org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
        log.warn("[REQUEST] file too large: {}", ex.getMessage());
        return ResponseEntity.status(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE)
            .body(WebResult.error(ResultCode.BAD_REQUEST, "audio file exceeds size limit"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<WebResult<Void>> onIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
            .body(WebResult.error(ResultCode.UNPROCESSABLE, ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<WebResult<Void>> onIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(WebResult.error(ResultCode.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<WebResult<Void>> onUnknown(Exception ex) {
        log.error("unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(WebResult.error(ResultCode.INTERNAL, "internal error"));
    }

    private static HttpStatus statusFor(ResultCode code) {
        return switch (code) {
            case OK -> HttpStatus.OK;
            case BAD_REQUEST -> HttpStatus.BAD_REQUEST;
            case UNAUTHORIZED -> HttpStatus.UNAUTHORIZED;
            case FORBIDDEN -> HttpStatus.FORBIDDEN;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case CONFLICT -> HttpStatus.CONFLICT;
            case UNPROCESSABLE -> HttpStatus.UNPROCESSABLE_ENTITY;
            case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            case UPSTREAM_UNAVAILABLE -> HttpStatus.BAD_GATEWAY;
            case INTERNAL -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
    }
}

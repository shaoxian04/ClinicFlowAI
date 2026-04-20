package my.cliniflow.controller.config;

import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<WebResult<Void>> onIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
            .body(WebResult.error(ResultCode.UNPROCESSABLE, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<WebResult<Void>> onUnknown(Exception ex) {
        log.error("unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(WebResult.error(ResultCode.INTERNAL, "internal error"));
    }
}

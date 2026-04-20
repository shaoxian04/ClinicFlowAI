package my.cliniflow.controller.base;

public record WebResult<T>(int code, String message, T data) {

    public static <T> WebResult<T> ok(T data) {
        return new WebResult<>(ResultCode.OK.code(), ResultCode.OK.defaultMessage(), data);
    }

    public static <T> WebResult<T> ok() {
        return ok(null);
    }

    public static <T> WebResult<T> error(ResultCode code, String message) {
        return new WebResult<>(code.code(), message != null ? message : code.defaultMessage(), null);
    }

    public static <T> WebResult<T> error(ResultCode code) {
        return error(code, null);
    }
}

package my.cliniflow.controller.base;

public enum ResultCode {
    OK(0, "ok"),
    BAD_REQUEST(40000, "bad request"),
    UNAUTHORIZED(40100, "unauthorized"),
    FORBIDDEN(40300, "forbidden"),
    NOT_FOUND(40400, "not found"),
    CONFLICT(40900, "conflict"),
    UNPROCESSABLE(42200, "unprocessable entity"),
    RATE_LIMITED(42900, "rate limited"),
    INTERNAL(50000, "internal error"),
    UPSTREAM_UNAVAILABLE(50300, "upstream unavailable");

    private final int code;
    private final String defaultMessage;

    ResultCode(int code, String defaultMessage) {
        this.code = code;
        this.defaultMessage = defaultMessage;
    }

    public int code() {
        return code;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}

package my.cliniflow.controller.base;

public class BusinessException extends RuntimeException {

    private final ResultCode resultCode;

    public BusinessException(ResultCode resultCode, String message) {
        super(message != null ? message : resultCode.defaultMessage());
        this.resultCode = resultCode;
    }

    public BusinessException(ResultCode resultCode, String message, Throwable cause) {
        super(message != null ? message : resultCode.defaultMessage(), cause);
        this.resultCode = resultCode;
    }

    public ResultCode resultCode() {
        return resultCode;
    }
}

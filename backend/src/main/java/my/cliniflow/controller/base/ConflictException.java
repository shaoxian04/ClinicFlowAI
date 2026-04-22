package my.cliniflow.controller.base;

public class ConflictException extends BusinessException {

    public ConflictException(String message) {
        super(ResultCode.CONFLICT, message);
    }
}

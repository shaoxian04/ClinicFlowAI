package my.cliniflow.controller.base;

public class ResourceNotFoundException extends BusinessException {

    public ResourceNotFoundException(String resourceType, Object id) {
        super(ResultCode.NOT_FOUND, resourceType + " not found: " + id);
    }

    public ResourceNotFoundException(String message) {
        super(ResultCode.NOT_FOUND, message);
    }
}

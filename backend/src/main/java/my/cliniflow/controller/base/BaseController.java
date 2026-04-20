package my.cliniflow.controller.base;

public abstract class BaseController {

    protected <T> WebResult<T> success(T data) {
        return WebResult.ok(data);
    }

    protected <T> WebResult<T> success() {
        return WebResult.ok();
    }
}

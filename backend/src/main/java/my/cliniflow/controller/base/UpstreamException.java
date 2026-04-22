package my.cliniflow.controller.base;

public class UpstreamException extends BusinessException {

    private final int upstreamStatus;
    private final String upstreamBody;

    public UpstreamException(String upstreamName, int upstreamStatus, String upstreamBody, Throwable cause) {
        super(
            ResultCode.UPSTREAM_UNAVAILABLE,
            upstreamName + " returned HTTP " + upstreamStatus,
            cause
        );
        this.upstreamStatus = upstreamStatus;
        this.upstreamBody = upstreamBody;
    }

    public int upstreamStatus() {
        return upstreamStatus;
    }

    public String upstreamBody() {
        return upstreamBody;
    }
}

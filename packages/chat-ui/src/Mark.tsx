import markUrl from "../../../packages/brand/logo/mark.svg";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <img
      className="mark"
      src={markUrl}
      width={size}
      height={size}
      alt=""
      data-testid="assistant-avatar"
    />
  );
}

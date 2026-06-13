interface LoadingAnimationProps {
  /** CSS width (e.g. "120px", "100%"). Height auto-derives from the SVG aspect ratio. */
  width?: string | number;
  /** Override colour — defaults to the brand accent. */
  color?: string;
  /** Accessible label; omit for purely decorative use. */
  label?: string;
}

// Four-dot horizontal bounce. SMIL-animated so it works without a JS runtime.
// Original viewBox was 1920×1080 with the dots clustered around the centre;
// we crop tightly so the loader stays compact at small sizes (~120×35 px).
export function LoadingAnimation({
  width = "120px",
  color = "var(--accent-orange)",
  label,
}: LoadingAnimationProps) {
  return (
    <svg
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
      viewBox="737 455 450 130"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width, height: "auto", color, display: "block" }}
    >
      <g opacity="0.25">
        <animate
          repeatCount="indefinite"
          attributeName="opacity"
          dur="1.35s"
          begin="0s"
          fill="freeze"
          values="0.25; 1; 0.25; 0.25"
          keyTimes="0; 0.17284; 0.37037; 1"
          keySplines="0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
          calcMode="spline"
        />
        <g transform="translate(782,540)">
          <animateTransform
            repeatCount="indefinite"
            type="translate"
            attributeName="transform"
            dur="1.35s"
            begin="0s"
            calcMode="spline"
            values="782 540; 782 500; 782 540; 782 540"
            keyTimes="0; 0.17284; 0.37037; 1"
            keySplines="0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
            fill="freeze"
          />
          <g transform="scale(0.5,0.5)">
            <animateTransform
              repeatCount="indefinite"
              type="scale"
              attributeName="transform"
              dur="1.35s"
              begin="0s"
              calcMode="spline"
              values="0.5 0.5; 0.75 0.75; 0.5 0.5; 0.5 0.5"
              keyTimes="0; 0.17284; 0.37037; 1"
              keySplines="0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
              fill="freeze"
            />
            <ellipse ry="60" rx="60" cy="0" cx="0" fill="currentColor" />
          </g>
        </g>
      </g>
      <g opacity="0.25">
        <animate
          repeatCount="indefinite"
          attributeName="opacity"
          dur="1.35s"
          begin="0s"
          fill="freeze"
          values="0.25; 0.25; 1; 0.25; 0.25"
          keyTimes="0; 0.111111; 0.283951; 0.481481; 1"
          keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
          calcMode="spline"
        />
        <g transform="translate(902,540)">
          <animateTransform
            repeatCount="indefinite"
            type="translate"
            attributeName="transform"
            dur="1.35s"
            begin="0s"
            calcMode="spline"
            values="902 540; 902 540; 902 500; 902 540; 902 540"
            keyTimes="0; 0.111111; 0.283951; 0.481481; 1"
            keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
            fill="freeze"
          />
          <g transform="scale(0.5,0.5)">
            <animateTransform
              repeatCount="indefinite"
              type="scale"
              attributeName="transform"
              dur="1.35s"
              begin="0s"
              calcMode="spline"
              values="0.5 0.5; 0.5 0.5; 0.75 0.75; 0.5 0.5; 0.5 0.5"
              keyTimes="0; 0.111111; 0.283951; 0.481481; 1"
              keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
              fill="freeze"
            />
            <ellipse ry="60" rx="60" cy="0" cx="0" fill="currentColor" />
          </g>
        </g>
      </g>
      <g opacity="0.25">
        <animate
          repeatCount="indefinite"
          attributeName="opacity"
          dur="1.35s"
          begin="0s"
          fill="freeze"
          values="0.25; 0.25; 1; 0.25; 0.25"
          keyTimes="0; 0.209877; 0.382716; 0.580247; 1"
          keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
          calcMode="spline"
        />
        <g transform="translate(1022,540)">
          <animateTransform
            repeatCount="indefinite"
            type="translate"
            attributeName="transform"
            dur="1.35s"
            begin="0s"
            calcMode="spline"
            values="1022 540; 1022 540; 1022 500; 1022 540; 1022 540"
            keyTimes="0; 0.209876; 0.382716; 0.580247; 1"
            keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
            fill="freeze"
          />
          <g transform="scale(0.5,0.5)">
            <animateTransform
              repeatCount="indefinite"
              type="scale"
              attributeName="transform"
              dur="1.35s"
              begin="0s"
              calcMode="spline"
              values="0.5 0.5; 0.5 0.5; 0.75 0.75; 0.5 0.5; 0.5 0.5"
              keyTimes="0; 0.209876; 0.382716; 0.580247; 1"
              keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
              fill="freeze"
            />
            <ellipse ry="60" rx="60" cy="0" cx="0" fill="currentColor" />
          </g>
        </g>
      </g>
      <g opacity="0.25">
        <animate
          repeatCount="indefinite"
          attributeName="opacity"
          dur="1.35s"
          begin="0s"
          fill="freeze"
          values="0.25; 0.25; 1; 0.25; 0.25"
          keyTimes="0; 0.308642; 0.481482; 0.679012; 1"
          keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
          calcMode="spline"
        />
        <g transform="translate(1142,540)">
          <animateTransform
            repeatCount="indefinite"
            type="translate"
            attributeName="transform"
            dur="1.35s"
            begin="0s"
            calcMode="spline"
            values="1142 540; 1142 540; 1142 500; 1142 540; 1142 540"
            keyTimes="0; 0.308642; 0.481482; 0.679013; 1"
            keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
            fill="freeze"
          />
          <g transform="scale(0.5,0.5)">
            <animateTransform
              repeatCount="indefinite"
              type="scale"
              attributeName="transform"
              dur="1.35s"
              begin="0s"
              calcMode="spline"
              values="0.5 0.5; 0.5 0.5; 0.75 0.75; 0.5 0.5; 0.5 0.5"
              keyTimes="0; 0.308642; 0.481482; 0.679013; 1"
              keySplines="0 0 1 1; 0.333 0 0.667 1; 0.333 0 0.667 1; 0 0 1 1"
              fill="freeze"
            />
            <ellipse ry="60" rx="60" cy="0" cx="0" fill="currentColor" />
          </g>
        </g>
      </g>
    </svg>
  );
}

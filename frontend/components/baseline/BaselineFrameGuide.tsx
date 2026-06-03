type BaselineFrameGuideProps = {
  className?: string;
};

const guideLines = [
  { label: "얼굴", topClassName: "top-[26%]" },
  { label: "상체", topClassName: "top-[44%]" },
  { label: "무릎", topClassName: "top-[82%]" },
];

export function BaselineFrameGuide({ className }: BaselineFrameGuideProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className ?? ""}`}>
      {guideLines.map((line) => (
        <div
          key={line.label}
          className={`absolute inset-x-[13%] ${line.topClassName}`}
        >
          <span className="absolute -top-3 -translate-x-[115%] text-base font-bold text-blue-300">
            {line.label}
          </span>
          <span className="block border-t border-dashed border-blue-200/75" />
        </div>
      ))}

      <div className="absolute left-1/2 top-[7%] h-[90%] w-[min(36%,404px)] -translate-x-1/2">
        <svg
          className="h-full w-full"
          viewBox="0 0 404 553"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <path
            d="M31.5001 379.088C32.9819 381.986 32.7836 384.993 33.0001 388.088C33.0361 391.378 32.894 392.832 32.5001 395.088C31.5222 396.888 30.9752 397.721 30.0001 399.088C22.7934 403.889 19.2344 407.002 13.5001 413.088C9.47021 421.089 7.53265 425.577 5.00012 433.588C2.95916 443.77 2.17525 449.046 1.50012 457.588C0.915495 466.579 0.68835 471.615 0.500122 480.588C0.709591 490.514 0.944018 495.471 1.50012 503.588C2.2407 513.401 2.70099 522.818 4.00018 531.588C4.89445 541.802 6.43708 543.203 7.50018 552.088"
            fill="none"
            stroke="rgba(59,130,246,0.98)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M396.5 552.588L400.5 518.588C402.773 489.419 403.571 473.439 401 448.088C399.411 439.407 397.457 431.138 390 412.588C378.351 402.198 373.889 398.757 373.5 394.088C372.9 386.658 374.801 380.902 379.5 373.088C381.985 366.938 381.965 363.271 382.5 355.588C382.5 346.588 382.5 341.088 381.5 331.588C370.107 293.462 363.181 272.272 350.5 234.588C348.713 229.154 349 227.088 335.5 200.588C322 174.088 288.4 169.148 276.5 165.526C264.6 161.904 269.715 163.588 257 160.026C244.285 156.464 252 141.588 252 141.588C252 141.588 259.079 134.732 266 124.588C275.252 106.992 276.524 99.8927 278 81.5882C278.07 68.863 277.374 61.5458 268.5 40.0881C254.001 20.1289 239.655 6.30942 216 1.08814C190.508 -1.20615 177.279 2.92391 157.5 18.5882C138.577 39.8929 130.056 56.4989 130.5 85.0881C134.138 112.079 138.612 122.01 155.5 141.588C161.451 141.987 159.367 156.001 157.5 157.588C155.634 159.175 111.5 171.588 111.5 171.588C101.149 176.036 96.0002 179.088 89.5002 183.088C83.0002 187.088 76.8903 195.153 67.0002 213.088C58.6791 233.325 41.9798 275.105 28.0002 331.088C26.4 341.162 25.7981 346.94 25.5002 357.588C25.4807 361.664 27.8352 369.476 31.5002 379.088"
            fill="none"
            stroke="rgba(59,130,246,0.98)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

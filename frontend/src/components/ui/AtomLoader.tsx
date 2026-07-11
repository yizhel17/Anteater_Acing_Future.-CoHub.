interface AtomLoaderProps {
  active: boolean
}

const ORBIT_PATH = 'M158,100 A58,21 0 0,1 42,100 A58,21 0 0,1 158,100'

export function AtomLoader({ active }: AtomLoaderProps) {
  return (
    <div className={`atom-loader${active ? ' active' : ''}`}>
      <div className="atom-stage">
        <svg className="atom-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="glow-nucleus" x="-80%" y="-80%" width="360%" height="360%">
              <feGaussianBlur stdDeviation="6" result="b1" />
              <feGaussianBlur stdDeviation="3" result="b2" in="SourceGraphic" />
              <feMerge>
                <feMergeNode in="b1" />
                <feMergeNode in="b2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-orbit" x="-30%" y="-200%" width="160%" height="500%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-electron" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <path id="ep-base" d={ORBIT_PATH} fill="none" />
          </defs>

          <circle cx="100" cy="100" r="97" fill="#080200" />

          <ellipse cx="100" cy="100" rx="58" ry="21" fill="none" stroke="#6b2200" strokeWidth="1.2" />
          <ellipse
            cx="100"
            cy="100"
            rx="58"
            ry="21"
            fill="none"
            stroke="#6b2200"
            strokeWidth="1.2"
            transform="rotate(60,100,100)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="58"
            ry="21"
            fill="none"
            stroke="#6b2200"
            strokeWidth="1.2"
            transform="rotate(-60,100,100)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="58"
            ry="21"
            fill="none"
            stroke="#ff5500"
            strokeWidth="1.8"
            opacity="0.75"
            filter="url(#glow-orbit)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="58"
            ry="21"
            fill="none"
            stroke="#ff5500"
            strokeWidth="1.8"
            opacity="0.75"
            filter="url(#glow-orbit)"
            transform="rotate(60,100,100)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="58"
            ry="21"
            fill="none"
            stroke="#ff5500"
            strokeWidth="1.8"
            opacity="0.75"
            filter="url(#glow-orbit)"
            transform="rotate(-60,100,100)"
          />

          <circle
            cx="100"
            cy="100"
            r="20"
            fill="#cc3300"
            filter="url(#glow-nucleus)"
            opacity="0.5"
            className="nucleus-pulse"
          />
          <circle cx="100" cy="100" r="13" fill="#ff5500" filter="url(#glow-orbit)" opacity="0.9" />
          <circle cx="100" cy="100" r="9" fill="#ff8800" />
          <circle cx="100" cy="100" r="6" fill="#ffbb00" />
          <circle cx="100" cy="100" r="3" fill="#fff5cc" />

          <g transform="rotate(0,100,100)">
            <circle r="5" fill="#ffdd33" filter="url(#glow-electron)">
              <animateMotion dur="1.85s" repeatCount="indefinite" path={ORBIT_PATH} />
            </circle>
          </g>

          <g transform="rotate(60,100,100)">
            <circle r="5" fill="#ffdd33" filter="url(#glow-electron)">
              <animateMotion dur="2.65s" repeatCount="indefinite" begin="0.7s" path={ORBIT_PATH} />
            </circle>
          </g>

          <g transform="rotate(-60,100,100)">
            <circle r="5" fill="#ffdd33" filter="url(#glow-electron)">
              <animateMotion dur="1.45s" repeatCount="indefinite" begin="1.3s" path={ORBIT_PATH} />
            </circle>
          </g>
        </svg>
      </div>
      <p className="atom-label">
        Pulling from the hive mind
        <span className="dot-1">.</span>
        <span className="dot-2">.</span>
        <span className="dot-3">.</span>
      </p>
    </div>
  )
}

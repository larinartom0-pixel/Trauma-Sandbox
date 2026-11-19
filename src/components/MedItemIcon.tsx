import React from 'react';
import { MedItemId } from '../game/types';

interface MedItemIconProps {
  medId: MedItemId;
  className?: string;
}

export const MedItemIcon: React.FC<MedItemIconProps> = ({
  medId,
  className = 'w-10 h-10',
}) => {
  switch (medId) {
    case 'bandage':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Unrolled sterile gauze tail */}
          <path
            d="M20 35 L42 35 L40 42 L15 42 Z"
            fill="#cbd5e1"
            stroke="#334155"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Main bandage roll cylinder */}
          <rect
            x="8"
            y="10"
            width="24"
            height="28"
            rx="5"
            fill="#f8fafc"
            stroke="#334155"
            strokeWidth="1.8"
          />
          {/* Roll side spiral core */}
          <ellipse
            cx="28"
            cy="24"
            rx="6"
            ry="13.5"
            fill="#e2e8f0"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <ellipse
            cx="28"
            cy="24"
            rx="2.6"
            ry="6"
            fill="#94a3b8"
            stroke="#475569"
            strokeWidth="1.2"
          />
          {/* Medical cross badge */}
          <rect x="13" y="19" width="8" height="3" rx="0.8" fill="#ef4444" />
          <rect x="15.5" y="16.5" width="3" height="8" rx="0.8" fill="#ef4444" />
        </svg>
      );

    case 'tourniquet':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Main black nylon CAT loop */}
          <rect
            x="7"
            y="17"
            width="34"
            height="14"
            rx="4"
            fill="#1e293b"
            stroke="#f59e0b"
            strokeWidth="2"
          />
          {/* Orange safety strap strip */}
          <rect x="10" y="21" width="24" height="6" rx="1.5" fill="#f97316" />
          {/* Friction buckle */}
          <rect
            x="33"
            y="14"
            width="9"
            height="20"
            rx="2"
            fill="#334155"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />
          {/* Windlass T-rod */}
          <rect
            x="17"
            y="7"
            width="5"
            height="21"
            rx="2"
            fill="#94a3b8"
            stroke="#0f172a"
            strokeWidth="1.4"
          />
          <rect
            x="11"
            y="7"
            width="17"
            height="5"
            rx="2"
            fill="#cbd5e1"
            stroke="#0f172a"
            strokeWidth="1.4"
          />
          {/* White time label */}
          <rect x="11" y="33" width="16" height="5" rx="1" fill="#f8fafc" stroke="#334155" strokeWidth="1" />
        </svg>
      );

    case 'splint':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Padded aluminum splint board */}
          <rect
            x="6"
            y="14"
            width="36"
            height="20"
            rx="5"
            fill="#0284c7"
            stroke="#e0f2fe"
            strokeWidth="1.8"
          />
          {/* Corrugated inner foam core */}
          <path
            d="M11 19 L15 29 L19 19 L23 29 L27 19 L31 29 L35 19"
            fill="none"
            stroke="#7dd3fc"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Two velcro fixation straps */}
          <rect x="12" y="10" width="6" height="28" rx="1.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
          <rect x="30" y="10" width="6" height="28" rx="1.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
          {/* Strap metal rings */}
          <rect x="12.5" y="12" width="5" height="3" rx="0.6" fill="#cbd5e1" />
          <rect x="30.5" y="12" width="5" height="3" rx="0.6" fill="#cbd5e1" />
        </svg>
      );

    case 'tweezers':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Surgical forceps blades */}
          <path
            d="M36 9 L13 33 L10 38 L15 35 L39 12"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M39 12 L17 36 L11 39"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Joined spring tail */}
          <circle cx="37.5" cy="10.5" r="3.4" fill="#cbd5e1" stroke="#334155" strokeWidth="1.4" />
          {/* Serrated grip lines */}
          <line x1="25" y1="20" x2="28" y2="23" stroke="#475569" strokeWidth="1.6" />
          <line x1="22" y1="23" x2="25" y2="26" stroke="#475569" strokeWidth="1.6" />
          <line x1="19" y1="26" x2="22" y2="29" stroke="#475569" strokeWidth="1.6" />
        </svg>
      );

    case 'syringe_saline':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Hanging loop */}
          <circle cx="24" cy="6.5" r="2.5" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
          {/* IV saline pouch */}
          <rect
            x="13"
            y="9"
            width="22"
            height="26"
            rx="4"
            fill="#0c2638"
            stroke="#7dd3fc"
            strokeWidth="1.8"
          />
          {/* Saline fluid fill */}
          <rect x="14.5" y="16" width="19" height="17.5" rx="2.5" fill="#38bdf8" fillOpacity="0.72" />
          {/* Drip port & tubing */}
          <rect x="21.5" y="35" width="5" height="4" rx="1" fill="#94a3b8" />
          <path d="M24 39 L24 44 C24 45.5 29 45.5 32 43" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" />
          <text
            x="24"
            y="25.5"
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            fill="#ffffff"
            fontFamily="monospace"
          >
            IV
          </text>
        </svg>
      );

    case 'blood_bag':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Hanger eyelet */}
          <circle cx="24" cy="6" r="2.4" fill="none" stroke="#cbd5e1" strokeWidth="1.8" />
          {/* Blood pouch */}
          <rect
            x="11"
            y="8.5"
            width="26"
            height="30"
            rx="5"
            fill="#450a0a"
            stroke="#f87171"
            strokeWidth="1.8"
          />
          {/* Deep crimson blood fill */}
          <rect x="13" y="13.5" width="22" height="23" rx="3" fill="#dc2626" />
          {/* Medical label */}
          <rect x="15" y="18" width="18" height="11" rx="2" fill="#fef2f2" />
          <text
            x="24"
            y="26"
            textAnchor="middle"
            fontSize="8"
            fontWeight="900"
            fill="#991b1b"
            fontFamily="monospace"
          >
            O-
          </text>
          {/* Lower port */}
          <rect x="21" y="38.5" width="6" height="5" rx="1" fill="#cbd5e1" />
        </svg>
      );

    case 'transfusion_tube':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Coiled sterile clear/cyan tubing */}
          <circle
            cx="24"
            cy="24"
            r="14"
            fill="none"
            stroke="#7dd3fc"
            strokeWidth="3.2"
          />
          <circle
            cx="24"
            cy="24"
            r="10"
            fill="none"
            stroke="#e0f2fe"
            strokeWidth="2"
            strokeDasharray="6 3"
          />
          {/* Drip chamber */}
          <rect
            x="8"
            y="10"
            width="8"
            height="14"
            rx="3"
            fill="#0c4a6e"
            stroke="#bae6fd"
            strokeWidth="1.5"
          />
          {/* Roller clamp */}
          <rect
            x="30"
            y="28"
            width="10"
            height="7"
            rx="1.5"
            fill="#0284c7"
            stroke="#e0f2fe"
            strokeWidth="1.4"
          />
          {/* Sterile green needle cap */}
          <rect x="33" y="8" width="6" height="9" rx="1.5" fill="#10b981" stroke="#d1fae5" strokeWidth="1.2" />
        </svg>
      );

    case 'used_syringe':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <g transform="rotate(45 24 24)">
            {/* Pushed-in plunger */}
            <rect x="20" y="10" width="8" height="2.5" rx="1" fill="#94a3b8" />
            <line x1="24" y1="12.5" x2="24" y2="28" stroke="#94a3b8" strokeWidth="2" />
            {/* Empty dirty glass barrel */}
            <rect
              x="19"
              y="14"
              width="10"
              height="20"
              rx="2"
              fill="#1c1917"
              stroke="#a8a29e"
              strokeWidth="1.5"
              strokeOpacity="0.8"
            />
            {/* Residue drop inside */}
            <rect x="20.5" y="28.5" width="7" height="4" rx="1" fill="#7f1d1d" fillOpacity="0.85" />
            {/* Exposed unsterile needle */}
            <rect x="22.2" y="34" width="3.6" height="3" fill="#a16207" />
            <line x1="24" y1="37" x2="24" y2="46" stroke="#d6d3d1" strokeWidth="1.4" />
          </g>
          {/* USED warning badge */}
          <rect x="2" y="32" width="24" height="12" rx="3" fill="#292524" stroke="#f59e0b" strokeWidth="1.4" />
          <text
            x="14"
            y="40.5"
            textAnchor="middle"
            fontSize="7"
            fontWeight="800"
            fill="#fcd34d"
            fontFamily="monospace"
          >
            USED
          </text>
        </svg>
      );

    case 'antibiotics':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Blister foil card */}
          <rect
            x="7"
            y="8"
            width="34"
            height="32"
            rx="4"
            fill="#cbd5e1"
            stroke="#475569"
            strokeWidth="1.8"
          />
          {/* 4 Capsules */}
          {[
            [16, 17],
            [32, 17],
            [16, 29],
            [32, 29],
          ].map(([cx, cy], idx) => (
            <g key={idx}>
              <rect x={cx - 5.5} y={cy - 3.5} width="5.5" height="7" rx="3" fill="#2563eb" />
              <rect x={cx} y={cy - 3.5} width="5.5" height="7" rx="3" fill="#f8fafc" />
              <rect
                x={cx - 6}
                y={cy - 4}
                width="12"
                height="8"
                rx="4"
                fill="none"
                stroke="#334155"
                strokeWidth="1"
              />
            </g>
          ))}
          <rect x="13" y="35" width="22" height="10" rx="2.5" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.3" />
          <text
            x="24"
            y="42.5"
            textAnchor="middle"
            fontSize="7"
            fontWeight="800"
            fill="#bfdbfe"
            fontFamily="monospace"
          >
            ABX
          </text>
        </svg>
      );

    case 'syringe_morphine':
    case 'syringe_adrenaline':
    case 'syringe_procoagulant':
    case 'syringe_naloxone':
    case 'syringe_immunobooster': {
      const cfg: Record<
        | 'syringe_morphine'
        | 'syringe_adrenaline'
        | 'syringe_procoagulant'
        | 'syringe_naloxone'
        | 'syringe_immunobooster',
        { color: string; code: string; cap: string }
      > = {
        syringe_morphine: { color: '#a855f7', code: 'MOR', cap: '#d8b4fe' },
        syringe_adrenaline: { color: '#f59e0b', code: 'ADR', cap: '#fde68a' },
        syringe_procoagulant: { color: '#ef4444', code: 'PRO', cap: '#fecaca' },
        syringe_naloxone: { color: '#10b981', code: 'NLX', cap: '#a7f3d0' },
        syringe_immunobooster: { color: '#22c55e', code: 'IMM', cap: '#bbf7d0' },
      };
      const c = cfg[medId];
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Plunger thumb pad */}
          <rect x="33" y="6" width="9" height="3.2" rx="1" transform="rotate(45 37.5 7.6)" fill="#e2e8f0" />
          {/* Plunger stem */}
          <line x1="36" y1="9" x2="29" y2="16" stroke="#cbd5e1" strokeWidth="2.4" strokeLinecap="round" />
          {/* Syringe barrel rotated 45 deg via group */}
          <g transform="rotate(45 24 24)">
            <rect
              x="19"
              y="12"
              width="10"
              height="22"
              rx="2"
              fill="#0f172a"
              stroke="#e2e8f0"
              strokeWidth="1.6"
            />
            {/* Colored drug fluid inside barrel */}
            <rect x="20.5" y="18" width="7" height="14.5" rx="1" fill={c.color} />
            {/* Graduation ticks */}
            <line x1="20" y1="16" x2="23" y2="16" stroke="#ffffff" strokeWidth="1" />
            <line x1="20" y1="21" x2="23" y2="21" stroke="#ffffff" strokeWidth="1" />
            <line x1="20" y1="26" x2="23" y2="26" stroke="#ffffff" strokeWidth="1" />
            {/* Needle hub + beveled needle */}
            <rect x="22" y="34" width="4" height="3.5" fill={c.cap} />
            <line x1="24" y1="37.5" x2="24" y2="46.5" stroke="#f8fafc" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          {/* High-contrast drug code pill */}
          <rect
            x="2"
            y="32"
            width="21"
            height="12"
            rx="3"
            fill="#090d14"
            stroke={c.color}
            strokeWidth="1.5"
          />
          <text
            x="12.5"
            y="40.5"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="800"
            fill={c.cap}
            fontFamily="monospace"
          >
            {c.code}
          </text>
        </svg>
      );
    }
  }
};

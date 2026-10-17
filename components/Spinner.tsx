import { COLORS } from "@/utils/styles";

const Spinner = () => (
  <div className="spinner-overlay" role="status" aria-live="polite">
    <style jsx>{`
      .spinner-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(255, 255, 255, 0.8); /* Optional: semi-transparent background */
        transition: opacity 0.3s ease; /* Fade effect */
        opacity: 1; /* Default opacity */
      }
      .spinner {
        /* Visible track on the light overlay (white-on-white was invisible) */
        border: 4px solid ${COLORS.primaryMedium}33; /* ~20% alpha */
        border-top: 4px solid ${COLORS.primaryMedium};
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
    <div className="spinner" aria-hidden="true" />
    <span className="sr-only">Loading…</span>
  </div>
);

export default Spinner;
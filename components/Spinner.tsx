const Spinner = () => (
  <div className="spinner-overlay">
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
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top: 4px solid #3498db; /* Change color as needed */
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
    <div className="spinner" />
  </div>
);

export default Spinner;
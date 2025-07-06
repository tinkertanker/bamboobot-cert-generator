/**
 * Centralized error messages with actionable advice
 */

export const ERROR_MESSAGES = {
  // File upload errors
  UPLOAD_FAILED: {
    title: "Upload Failed",
    message: "Could not upload your image. Please check that it's a valid PNG or JPEG file under 10MB.",
    action: "Try selecting a different image or converting it to PNG/JPEG format."
  },
  INVALID_FILE_TYPE: {
    title: "Invalid File Type",
    message: "Only PNG and JPEG images are supported.",
    action: "Please convert your file to PNG or JPEG format and try again."
  },
  FILE_TOO_LARGE: {
    title: "File Too Large",
    message: "The image file is larger than 10MB.",
    action: "Please reduce the file size using an image compression tool and try again."
  },

  // PDF generation errors
  PDF_GENERATION_FAILED: {
    title: "PDF Generation Failed",
    message: "Could not create your certificates. This might be due to invalid data or server issues.",
    action: "Please check your data and try again. If the problem persists, refresh the page."
  },
  PDF_TIMEOUT: {
    title: "Generation Timeout",
    message: "Creating PDFs is taking too long. This usually happens with very large datasets.",
    action: "Try generating fewer certificates at once (maximum 100 at a time)."
  },
  PDF_DOWNLOAD_FAILED: {
    title: "Download Failed",
    message: "Could not download the PDF file.",
    action: "Try clicking the download button again. If that doesn't work, try generating a new PDF."
  },

  // Email errors
  EMAIL_NOT_CONFIGURED: {
    title: "Email Not Configured",
    message: "Email settings have not been configured.",
    action: "Go to the Email tab and configure your sender name, subject, and message."
  },
  EMAIL_SEND_FAILED: {
    title: "Email Failed",
    message: "Could not send the email. This might be due to an invalid email address or server issues.",
    action: "Check that the email address is valid and try again."
  },
  EMAIL_RATE_LIMIT: {
    title: "Rate Limit Reached",
    message: "You've reached the email sending limit for this hour.",
    action: "Please wait before sending more emails. Consider upgrading your email service for higher limits."
  },

  // Data errors
  NO_DATA: {
    title: "No Data Found",
    message: "Please add some data to generate certificates.",
    action: "Paste your data in the Data tab or use the sample data to get started."
  },
  INVALID_DATA_FORMAT: {
    title: "Invalid Data Format",
    message: "The data format is not recognized.",
    action: "Make sure your data is tab-separated (TSV) or comma-separated (CSV). Check the format toggle."
  },
  EMPTY_CELLS_WARNING: {
    title: "Empty Cells Detected",
    message: "Some cells in your data are empty. This will create blank fields in the certificates.",
    action: "Review your data and fill in any missing values, or continue if blank fields are intended."
  },

  // Network errors
  NETWORK_ERROR: {
    title: "Network Error",
    message: "Could not connect to the server.",
    action: "Check your internet connection and try again."
  },
  SERVER_ERROR: {
    title: "Server Error",
    message: "Something went wrong on our end.",
    action: "Please refresh the page and try again. If the problem persists, contact support."
  },

  // Storage errors
  STORAGE_FULL: {
    title: "Storage Full",
    message: "Your browser's local storage is full.",
    action: "Clear some browser data or use a different browser."
  },

  // Generic fallback
  UNKNOWN_ERROR: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred.",
    action: "Please refresh the page and try again."
  }
} as const;

/**
 * Get user-friendly error message from an error object
 */
export function getErrorMessage(error: unknown): typeof ERROR_MESSAGES[keyof typeof ERROR_MESSAGES] {
  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('Failed to fetch')) {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }
    if (error.message.includes('timeout')) {
      return ERROR_MESSAGES.PDF_TIMEOUT;
    }
    if (error.message.includes('rate limit')) {
      return ERROR_MESSAGES.EMAIL_RATE_LIMIT;
    }
    if (error.message.includes('413') || error.message.includes('too large')) {
      return ERROR_MESSAGES.FILE_TOO_LARGE;
    }
    if (error.message.includes('Invalid file type')) {
      return ERROR_MESSAGES.INVALID_FILE_TYPE;
    }
    if (error.message.includes('email')) {
      return ERROR_MESSAGES.EMAIL_SEND_FAILED;
    }
    if (error.message.includes('pdf') || error.message.includes('PDF')) {
      return ERROR_MESSAGES.PDF_GENERATION_FAILED;
    }
  }
  
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Format error for display
 */
export function formatError(error: unknown): string {
  const errorInfo = getErrorMessage(error);
  return `${errorInfo.title}: ${errorInfo.message}\n\n${errorInfo.action}`;
}
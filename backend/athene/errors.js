export const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
export function publicFailure(error) {
  if (error.status && typeof error.code === 'string') return { code: error.code, message: error.message };
  return { code: 'PROCESSING_FAILED', message: 'Processing failed. Check service configuration and retry the document.' };
}

export function errorHandler(err, req, res, next) {
  console.error('[ERROR]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
  });

  const statusCode = err.statusCode || (err.status ? err.status : 500);
  const message = statusCode === 500 ? 'An internal server error occurred.' : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && statusCode === 500 ? { devDetails: err.message } : {}),
  });
}

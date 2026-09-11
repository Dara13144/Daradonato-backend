function errorHandler(err, req, res, next) {
  console.error('[Unhandled Error]', err.stack || err.message);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found.`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

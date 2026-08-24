/**
 * Express 4 does not await async route handlers, so a rejected promise escapes
 * as an unhandled rejection — which terminates the process on modern Node.
 * Wrapping the router's layers forwards those rejections to the error handler
 * instead, so one bad request can never take the API down.
 */
function wrapHandle(handle) {
  if (handle.length >= 4) {
    // Error-handling middleware: (err, req, res, next)
    return function wrappedErrorHandler(err, req, res, next) {
      try {
        const result = handle(err, req, res, next)
        if (result && typeof result.then === 'function') {
          result.catch(next)
        }
        return result
      } catch (error) {
        return next(error)
      }
    }
  }

  return function wrappedHandler(req, res, next) {
    try {
      const result = handle(req, res, next)
      if (result && typeof result.then === 'function') {
        result.catch(next)
      }
      return result
    } catch (error) {
      return next(error)
    }
  }
}

export function wrapRouterAsync(router) {
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack || []) {
        routeLayer.handle = wrapHandle(routeLayer.handle)
      }
    } else if (typeof layer.handle === 'function' && layer.handle.stack) {
      // Nested router
      wrapRouterAsync(layer.handle)
    } else if (typeof layer.handle === 'function') {
      layer.handle = wrapHandle(layer.handle)
    }
  }

  return router
}

/** Translates common MySQL errors into useful HTTP responses. */
export function databaseErrorMessage(error) {
  switch (error?.code) {
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return { status: 404, message: 'A referenced record does not exist' }
    case 'ER_DUP_ENTRY':
      return { status: 409, message: 'That record already exists' }
    case 'ER_DATA_TOO_LONG':
      return { status: 413, message: 'One of the values is too long' }
    case 'ER_NO_SUCH_TABLE':
      return { status: 503, message: 'The database is not fully set up yet' }
    default:
      return null
  }
}

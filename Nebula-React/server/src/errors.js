function postgresError(error) {
  if (error?.code === '23505') return { status: 409, code: 'DUPLICATE_RESOURCE', message: '数据已存在，请勿重复提交' }
  if (error?.code === '23503') return { status: 422, code: 'REFERENCE_INVALID', message: '关联的数据不存在或不可用' }
  if (error?.code === '22P02') return { status: 422, code: 'VALIDATION_ERROR', message: '参数格式不正确' }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '57P03'].includes(error?.code)) return { status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: '依赖服务暂时不可用，请稍后重试' }
  return null
}

export function errorResponse(res, error, req = null) {
  const mapped = postgresError(error)
  const isZod = error?.name === 'ZodError'
  const status = error.status || mapped?.status || (isZod ? 422 : 500)
  const code = error.code && !/^\d{5}$/.test(error.code) ? error.code : mapped?.code || (isZod ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR')
  const validationMessage = isZod ? error.issues?.map((issue) => `${issue.path.join('.') || '参数'}：${issue.message}`).join('；') : null
  const message = status >= 500 ? (mapped?.message || '服务器内部错误') : (validationMessage || mapped?.message || error.message || '请求处理失败')
  if (status >= 500) console.error(error)
  return res.status(status).json({ error: message, code, ...(req?.requestId ? { request_id: req.requestId } : {}) })
}

export function notFound(message = '资源不存在') {
  const error = new Error(message)
  error.status = 404
  error.code = 'NOT_FOUND'
  return error
}

export function conflict(message, code = 'CONFLICT') {
  const error = new Error(message)
  error.status = 409
  error.code = code
  return error
}

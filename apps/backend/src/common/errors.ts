export class ApplicationError extends Error {}

export class AuthenticationError extends ApplicationError {}

export class AuthorizationError extends ApplicationError {}

export class DuplicateResourceError extends ApplicationError {}

export class InvalidOperationError extends ApplicationError {}

export class NotFoundError extends ApplicationError {}

export class TooManyRequestsError extends ApplicationError {}

export class ApplicationError extends Error {}

export class AuthenticationError extends ApplicationError {}

export class DuplicateResourceError extends ApplicationError {}

export class InvalidOperationError extends ApplicationError {}

export class NotFoundError extends ApplicationError {}

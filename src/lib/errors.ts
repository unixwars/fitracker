export class AppError extends Error {
  constructor(name: string, message = name) {
    super(message)
    this.name = name
  }
}
export class AuthExpired extends AppError { constructor() { super('AuthExpired') } }
export class RateLimited extends AppError { constructor(public retryAfterMs = 2000) { super('RateLimited') } }
export class ApiError extends AppError { constructor(public status: number, message: string) { super('ApiError', message) } }
export class SchemaMismatch extends AppError { constructor(public version: number | null) { super('SchemaMismatch', `Unsupported schema version ${version}`) } }
export class NewerThanApp extends AppError { constructor(public version: number) { super('NewerThanApp', `Sheet schema ${version} is newer than this app`) } }
export class UnrecognisedLayout extends AppError { constructor(detail = '') { super('UnrecognisedLayout', detail) } }
export class RowGone extends AppError { constructor(public id: string) { super('RowGone', `No row with id ${id}`) } }
export class RowChanged extends AppError { constructor(public id: string) { super('RowChanged', `Row ${id} now holds a different entry`) } }
export class TabFull extends AppError { constructor() { super('TabFull') } }
export class WrongYear extends AppError { constructor(public found: unknown) { super('WrongYear') } }

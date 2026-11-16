export class AppError extends Error {
  constructor(name: string, message = name) {
    super(message)
    this.name = name
  }
}
export class AuthExpired extends AppError { constructor() { super('AuthExpired') } }
export class RateLimited extends AppError { constructor(public retryAfterMs = 2000) { super('RateLimited') } }
export class ApiError extends AppError { constructor(public status: number, message: string) { super('ApiError', message) } }
export class NewerThanApp extends AppError { constructor(public version: number) { super('NewerThanApp', `Sheet schema ${version} is newer than this app`) } }
export class UnrecognisedLayout extends AppError { constructor(detail = '') { super('UnrecognisedLayout', detail) } }
/** The header row of a reference tab (Accounts, Categories) is not the layout the app writes to. Local to that write: the book itself is still readable. */
export class ReferenceLayoutMismatch extends AppError { constructor(public tab: string, public found: string[], public expected: readonly string[]) { super('ReferenceLayoutMismatch', `${tab} headers do not match the layout`) } }
export class RowGone extends AppError { constructor(public id: string) { super('RowGone', `No row with id ${id}`) } }
export class RowChanged extends AppError { constructor(public id: string) { super('RowChanged', `Row ${id} now holds a different entry`) } }
export class AccountChanged extends AppError { constructor(public id: string) { super('AccountChanged', `The account of ${id} was renamed or changed currency`) } }

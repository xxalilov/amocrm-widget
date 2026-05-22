export class HttpException extends Error {
  public status: number;
  public message: string;
  public isTransactionError: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.status = status || 500;
    this.message = message || "Server error";
  }
}

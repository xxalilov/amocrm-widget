import { Request, Response, NextFunction } from "express";

const errorMiddleware = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (error?.isTransactionError) {
      return res.json({
        error: {
          code: error.transactionErrorCode,
          message: error.transactionErrorMessage,
          data: error.transactionData,
        },
        id: error.transactionId,
      });
    }

    const status: number = error.status || 500;
    const message: string = error.message || "Something went wrong";

    // Log message/stack only. Never log the raw error object — for axios errors
    // it carries request config including the Bearer token in headers.
    console.error(`[${status}] ${message}`, error?.stack || '');

    res.status(status).json({ status, message });
  } catch (error) {
    next(error);
  }
};

export default errorMiddleware;

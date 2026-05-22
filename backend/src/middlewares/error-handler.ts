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

    console.log(error);

    res.status(status).json({ status, message });
  } catch (error) {
    next(error);
  }
};

export default errorMiddleware;

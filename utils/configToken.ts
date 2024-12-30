import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
    user?: JwtPayload | string;
}

export const authenticateToken: RequestHandler = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    const token = req.headers['authorization'];

    if (!token) {
        res.status(401).json({ message: "Access Denied. No token provided." });
        return;
    }

    jwt.verify(token, process.env.JWT_Secret as string, (err, decoded) => {
        if (err) {
            res.status(403).json({ message: "Invalid or expired token." });
            return;
        }

        req.user = decoded;
        next();
    });
};

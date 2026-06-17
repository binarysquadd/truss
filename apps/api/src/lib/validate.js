// validate.js — Zod-based request validation middleware
import { ZodError } from "zod";

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured errors on failure, calls next() on success.
 * Replaces req.body with the parsed (coerced/stripped) result.
 *
 * Usage: router.post("/api/foo", validate(fooSchema), handler)
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return res.status(400).json({ error: errors[0].message, errors });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates query params against a Zod schema.
 * Usage: router.get("/api/foo", validateQuery(querySchema), handler)
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return res.status(400).json({ error: errors[0].message, errors });
    }
    req.query = result.data;
    next();
  };
}

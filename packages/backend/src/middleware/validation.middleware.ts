import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error.middleware';

export const validationMiddleware = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      throw new AppError(`Validation error: ${errorMessage}`, 400);
    }
    
    next();
  };
};

// Common validation schemas
export const crawlSessionSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  userId: Joi.string().required().uuid(),
  config: Joi.object({
    urls: Joi.array().items(Joi.string().uri()).required().min(1),
    excludePaths: Joi.array().items(Joi.string()).default([]),
    maxDepth: Joi.number().integer().min(1).max(10).default(3),
    concurrency: Joi.number().integer().min(1).max(20).default(5),
    respectRobots: Joi.boolean().default(true)
  }).required()
});

export const updateCrawlSessionSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  status: Joi.string().valid('pending', 'running', 'paused', 'completed', 'failed'),
  config: Joi.object({
    urls: Joi.array().items(Joi.string().uri()).min(1),
    excludePaths: Joi.array().items(Joi.string()),
    maxDepth: Joi.number().integer().min(1).max(10),
    concurrency: Joi.number().integer().min(1).max(20),
    respectRobots: Joi.boolean()
  })
});

export const queryParamsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'running', 'paused', 'completed', 'failed'),
  userId: Joi.string().uuid(),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});
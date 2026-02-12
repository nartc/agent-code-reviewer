import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().min(1) });

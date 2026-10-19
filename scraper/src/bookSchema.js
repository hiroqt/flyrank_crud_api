const { z } = require('zod');

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'));

module.exports = z.object({
  title: z.string().min(1),
  product_url: httpsUrl,
  price_text: z.string().min(1),
  price_gbp: z.number().finite().nonnegative(),
  availability_text: z.string().min(1),
  rating_text: z.string().min(1),
  description: z.string().nullable().optional(),
  source_page: httpsUrl,
  fetched_at: z.string().datetime(),
});

# Claude API Setup Guide

This guide walks you through setting up Anthropic's Claude API for QueryBoard.

## Getting Your Claude API Key

1. **Sign up for Anthropic Console**
   - Visit https://console.anthropic.com/
   - Create an account or sign in

2. **Generate API Key**
   - Navigate to "API Keys" section
   - Click "Create Key"
   - Copy your API key (starts with `sk-ant-`)
   - Store it securely - you won't see it again

3. **Add Credits**
   - Go to "Billing" section
   - Add credits to your account
   - Minimum recommended: $5 for testing

## Configuration

1. **Create `.env` file**

   ```bash
   cp .env.example .env
   ```

2. **Add your API key**

   ```env
   VITE_CLAUDE_API_KEY=sk-ant-api03-your-key-here
   VITE_CLAUDE_MODEL=claude-3-5-sonnet-20241022
   ```

3. **Available Models**
   - `claude-3-5-sonnet-20241022` (Recommended - Best balance)
   - `claude-3-opus-20240229` (Most capable, slower)
   - `claude-3-sonnet-20240229` (Fast, good quality)
   - `claude-3-haiku-20240307` (Fastest, most economical)

## How It Works

### Text-to-SQL Generation

When you ask: _"Show me sales by region"_

Claude receives:

```
You are a SQL expert. Convert the following natural language query
into a valid SQL query for AWS Athena.

Natural Language Query: Show me sales by region

Return ONLY the SQL query without any explanation.
```

Claude responds:

```sql
SELECT region, SUM(sales) as total_sales
FROM sales_table
GROUP BY region
ORDER BY total_sales DESC
```

### Chart Specification Generation

When you ask: _"Show me sales by region as a bar chart"_

Claude receives:

- User request
- Available columns
- Sample data (first 5 rows)

Claude responds with:

```json
{
  "vegaSpec": {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "title": "Sales by Region",
    "data": {"values": [...]},
    "mark": "bar",
    "encoding": {
      "x": {"field": "region", "type": "nominal"},
      "y": {"field": "total_sales", "type": "quantitative"}
    }
  },
  "explanation": "This bar chart displays total sales for each region..."
}
```

## Cost Estimation

### Claude 3.5 Sonnet Pricing

- Input: $3 per million tokens
- Output: $15 per million tokens

### Typical Usage per Chart

- Text-to-SQL: ~500 input + 100 output tokens = $0.003
- Chart Generation: ~1000 input + 500 output tokens = $0.011
- **Total per chart: ~$0.014 (1.4 cents)**

### Monthly Estimates

- 100 charts/month: ~$1.40
- 500 charts/month: ~$7.00
- 1000 charts/month: ~$14.00

## Security Considerations

### Browser Usage

The application uses `dangerouslyAllowBrowser: true` to enable client-side API calls. This is acceptable for:

- Internal tools
- Prototypes
- Trusted user environments

### For Production

Consider implementing a backend proxy:

```
User → Your Backend → Claude API → Your Backend → User
```

This prevents:

- API key exposure in browser
- Direct API access from client
- CORS issues
- Rate limiting per user

### Example Backend Proxy (Node.js/Express)

```javascript
import Anthropic from '@anthropic-ai/sdk'
import express from 'express'

const app = express()
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
})

app.post('/api/generate-sql', async (req, res) => {
  const { query } = req.body

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: query }],
  })

  res.json({ sql: message.content[0].text })
})
```

## Troubleshooting

### Error: "API key not found"

- Check `.env` file exists in project root
- Verify `VITE_CLAUDE_API_KEY` is set
- Restart dev server after changing `.env`

### Error: "Invalid API key"

- Verify API key starts with `sk-ant-`
- Check for extra spaces or quotes
- Generate a new key if needed

### Error: "Insufficient credits"

- Add credits in Anthropic Console
- Check billing section for current balance

### Error: "Rate limit exceeded"

- Wait a few seconds between requests
- Implement request throttling
- Upgrade to higher tier if needed

### CORS Errors

- Normal when using browser-based SDK
- Consider backend proxy for production
- Check browser console for details

## Best Practices

1. **Prompt Engineering**
   - Be specific in natural language queries
   - Provide schema context when available
   - Test with sample data first

2. **Error Handling**
   - Always wrap API calls in try-catch
   - Provide fallback options
   - Show user-friendly error messages

3. **Performance**
   - Cache common queries
   - Debounce user input
   - Show loading states

4. **Cost Optimization**
   - Use Haiku model for simple queries
   - Cache SQL queries locally
   - Limit sample data sent to Claude

## Support

- **Anthropic Documentation**: https://docs.anthropic.com/
- **API Reference**: https://docs.anthropic.com/claude/reference/
- **Discord Community**: https://discord.gg/anthropic
- **Support Email**: support@anthropic.com

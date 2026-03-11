type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

type TavilySearchResponse = {
  results?: TavilyResult[];
};

export async function searchTavily(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('Missing Tavily API key.');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Tavily request failed.');
  }

  const data = (await response.json()) as TavilySearchResponse;
  return Array.isArray(data.results) ? data.results : [];
}

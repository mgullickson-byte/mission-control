'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError('Enter a query to search the web.');
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: trimmedQuery })
      });

      const payload = (await response.json()) as {
        results?: SearchResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Search failed.');
      }

      setResults(payload.results ?? []);
    } catch (requestError) {
      setResults([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Search failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="content search-page">
      <div className="search-header">
        <h1 className="page-title">Web Search</h1>
        <Link className="nav-link inline" href="/">
          Back to Dashboard
        </Link>
      </div>
      <p className="page-subtitle">Search the web with Tavily</p>

      <form className="search-form" onSubmit={handleSubmit}>
        <input
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. top AI agency trends in 2026"
          value={query}
        />
        <button
          className="list-button search-button"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error ? <p className="search-error">{error}</p> : null}

      <section className="table-wrap search-results">
        {results.length === 0 && !isLoading ? (
          <p className="search-empty">No results yet. Run a search above.</p>
        ) : (
          <ul className="results-list">
            {results.map((result) => (
              <li className="result-item" key={result.url}>
                <a href={result.url} rel="noreferrer" target="_blank">
                  {result.title}
                </a>
                <p className="result-url">{result.url}</p>
                <p className="result-content">{result.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

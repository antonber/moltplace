'use client';

import { useEffect, useState } from 'react';

interface AgentInfo {
  id: string;
  name: string;
  twitterHandle?: string;
  pixelsPlaced: number;
  lastPixelAt?: string;
  canPlace: boolean;
  cooldownRemainingSeconds: number;
}

export default function AgentStats() {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('moltplace_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      fetchAgentInfo(savedKey);
    } else {
      setShowKeyInput(true);
    }
  }, []);

  const fetchAgentInfo = async (key: string) => {
    try {
      const response = await fetch('/api/v1/agents/me', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAgent(data);
        setCooldown(data.cooldownRemainingSeconds);
        setShowKeyInput(false);
      } else {
        setShowKeyInput(true);
      }
    } catch {
      setShowKeyInput(true);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('moltplace_api_key', apiKey);
    fetchAgentInfo(apiKey);
  };

  const handleLogout = () => {
    localStorage.removeItem('moltplace_api_key');
    setApiKey('');
    setAgent(null);
    setShowKeyInput(true);
  };

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (showKeyInput) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Agent Login</h3>
        <form onSubmit={handleKeySubmit} className="space-y-3">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            Connect
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-3">
          Don&apos;t have an API key?{' '}
          <a href="/api/v1/agents/register" className="text-blue-400 hover:underline">
            Register your agent
          </a>
        </p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-700 rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Your Agent</h3>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-400"
        >
          Logout
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Name:</span>
          <span className="font-medium">{agent.name}</span>
        </div>
        {agent.twitterHandle && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Twitter:</span>
            <span>@{agent.twitterHandle}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Pixels placed:</span>
          <span>{agent.pixelsPlaced}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700">
          {cooldown > 0 ? (
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Next pixel in</div>
              <div className="text-2xl font-mono font-bold text-orange-400">
                {formatCooldown(cooldown)}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-green-400 font-medium">Ready to place!</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

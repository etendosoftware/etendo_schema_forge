import * as React from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { cn } from '@/lib/utils';
import { Bot, X, Send, Sparkles } from 'lucide-react';
import { useCopilot } from './CopilotContext';

const mockResponses = {
  invoice:
    "I'll help you create an invoice. Opening Sales Invoice...\n\nYou can also say 'show pending invoices' to see what's outstanding.",
  stock:
    "Here's a quick stock summary:\n\u2022 Cerveza Ale 0.5L: 150 units\n\u2022 Vino Tinto Reserva: 80 units\n\u2022 Aceite de Oliva 1L: 230 units\n\nWould you like to check a specific product?",
  order:
    "You have 5 pending orders:\n\u2022 SO-2026-0234 \u2014 Empresa ABC ($8,500)\n\u2022 SO-2026-0235 \u2014 Tech Solutions ($3,200)\n\u2022 SO-2026-0236 \u2014 Global Trade ($15,000)\n\nShould I open the orders list?",
  contact:
    "I found 156 contacts. Top customers by revenue:\n1. Global Trade Ltd \u2014 $85,000\n2. Empresa ABC \u2014 $52,000\n3. Ib\u00e9rica Industrial \u2014 $34,000\n\nWho are you looking for?",
  default:
    'I can help with invoices, orders, stock, contacts, and more. What would you like to do?',
};

const suggestionChips = [
  'Create an invoice',
  'Check stock levels',
  'Show pending orders',
  'Find a contact',
];

function getResponse(text) {
  const lower = text.toLowerCase();
  for (const key of Object.keys(mockResponses)) {
    if (key !== 'default' && lower.includes(key)) {
      return mockResponses[key];
    }
  }
  return mockResponses.default;
}

export function CopilotWidget() {
  const { isOpen: open, open: openPanel, close: closePanel, toggle } = useCopilot();
  const [messages, setMessages] = React.useState([
    {
      role: 'copilot',
      text: "Hi! I'm your ERP assistant. What do you need today?",
    },
  ]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const messagesEndRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && open) {
        closePanel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const sendMessage = React.useCallback(
    (text) => {
      if (!text.trim()) return;
      const userMsg = { role: 'user', text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsTyping(true);

      setTimeout(() => {
        const response = getResponse(text);
        setMessages((prev) => [...prev, { role: 'copilot', text: response }]);
        setIsTyping(false);
      }, 800);
    },
    []
  );

  const handleSubmit = React.useCallback(
    (e) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const showChips = messages.length === 1 && messages[0].role === 'copilot';

  return (
    <>
      {/* Chat panel */}
      <div
        className={cn(
          'fixed bottom-20 right-6 z-50 w-full max-w-sm transition-all duration-300 ease-out',
          open
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-4 opacity-0 pointer-events-none'
        )}
      >
        <Card className="flex flex-col shadow-2xl border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <CardTitle className="text-base">Copilot</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => closePanel()}
              aria-label="Close Copilot"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <Separator />

          <CardContent className="p-0">
            {/* Messages area */}
            <div className="flex flex-col gap-3 p-4 overflow-y-auto max-h-80 min-h-[200px]">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2 max-w-[85%]',
                    msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                  )}
                >
                  {msg.role === 'copilot' && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm whitespace-pre-line',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {/* Suggestion chips */}
              {showChips && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {suggestionChips.map((chip) => (
                    <Badge
                      key={chip}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => sendMessage(chip)}
                    >
                      {chip}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-2 mr-auto">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce [animation-delay:0ms]">.</span>
                      <span className="animate-bounce [animation-delay:150ms]">.</span>
                      <span className="animate-bounce [animation-delay:300ms]">.</span>
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <Separator />

            {/* Input area */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something..."
                className="flex-1 h-9"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!input.trim() || isTyping}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Floating trigger button */}
      <Button
        onClick={toggle}
        size="icon"
        className={cn(
          'fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg transition-all duration-200',
          !open && 'animate-pulse shadow-primary/25 shadow-xl'
        )}
        aria-label={open ? 'Close Copilot' : 'Open Copilot'}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <span className="relative">
            <Bot className="h-5 w-5" />
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300 animate-spin [animation-duration:3s]" />
          </span>
        )}
      </Button>
    </>
  );
}

import { Component } from 'react';
import { sb } from '@/lib/supabase';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to Supabase asynchronously — fire and forget
    try {
      sb.rpc('log_error', {
        p_message:  String(error?.message || error),
        p_stack:    String(info?.componentStack || error?.stack || ''),
        p_url:      typeof window !== 'undefined' ? window.location.href : '',
        p_severity: 'fatal',
      }).catch(() => {});  // silently ignore if RPC itself fails
    } catch (_) {}
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="text-5xl">💥</div>
          <h2 className="text-lg font-bold text-slate-800">Что-то пошло не так</h2>
          <p className="text-sm text-slate-500">
            Произошла неожиданная ошибка. Мы уже получили отчёт и разберёмся.<br />
            Попробуйте перезагрузить страницу.
          </p>
          {this.state.error && (
            <details className="text-left">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                Подробности ошибки
              </summary>
              <pre className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                {String(this.state.error)}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReload}
            className="btn-primary w-full"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}

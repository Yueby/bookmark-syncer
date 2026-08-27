import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { detectBrowserLocale, readLanguageSetting, resolveLocale, translate } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  locale: ReturnType<typeof detectBrowserLocale>
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, locale: detectBrowserLocale() }
  }

  // 挂载后异步读取手动语言设置（Provider 尚未渲染时兜底用浏览器语言）
  override async componentDidMount() {
    const setting = await readLanguageSetting()
    this.setState({ locale: resolveLocale(setting) })
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, locale: detectBrowserLocale() }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const { locale } = this.state
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
              {translate(locale, 'errorBoundary.title')}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              {this.state.error?.message || translate(locale, 'common.unknownError')}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {translate(locale, 'errorBoundary.retry')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

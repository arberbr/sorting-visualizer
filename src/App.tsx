export default function App() {
  return (
    <div className="app">
      <header className="app__head">
        <div className="wordmark">
          sort<span>.</span>
        </div>
        <div className="label">algorithm visualizer</div>
      </header>
      <nav className="app__rail" aria-label="Algorithms" />
      <main className="app__stage" />
      <section className="app__controls" />
      <aside className="app__inspector" />
    </div>
  )
}

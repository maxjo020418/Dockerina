import reactLogo from "../assets/react.svg";
import agenticaLogo from "/agentica.svg";

export function Landing() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center p-8 relative">
      <div className="space-y-8">
        <div className="flex gap-8 items-center justify-center">
          <a
            href="https://wrtnlabs.io/agentica/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all"
          >
            <img
              src={agenticaLogo}
              alt="Agentica logo"
              className="w-24 h-24 transition-all hover:filter hover:drop-shadow-[0_0_1rem_rgba(255,255,255,0.5)]"
            />
          </a>
          <span className="text-4xl font-bold text-gray-500">+</span>
          <a
            href="https://react.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all"
          >
            <img
              src={reactLogo}
              alt="React logo"
              className="w-24 h-24 animate-[spin_10s_linear_infinite] transition-all hover:filter hover:drop-shadow-[0_0_1rem_#61dafbaa]"
            />
          </a>
        </div>

        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-100 to-white bg-clip-text text-transparent">
            Agentica + React
          </h1>
          <p className="text-lg text-gray-400 max-w-md">
            Experience the power of AI-driven conversations with Agentica,
            seamlessly integrated with React's modern UI framework.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <a
            href="https://wrtnlabs.io/agentica/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-gray-100 transition-all shadow-md hover:shadow-lg"
          >
            Documentation
          </a>
          <a
            href="https://github.com/wrtnlabs/agentica"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 border border-gray-700 bg-transparent text-gray-300 rounded-lg hover:bg-white/5 transition-all"
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

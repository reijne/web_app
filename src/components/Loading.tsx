import './components.css';

export function Loading({ resource = '' }: { resource?: string }) {
    return (
        <div className="loading">
            <div className="icon">⚪</div> Loading{resource}...
        </div>
    );
}

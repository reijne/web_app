import React from 'react';

import './Brightside.css';

interface Story {
    id: string;
    outlet: string;
    date: string;
    category: string;
    headline: string;
    dek: string;
    aiSpinTitle?: string;
    aiSpin: string;
    accent:
        | 'purple-accent'
        | 'pink-accent'
        | 'red-accent'
        | 'orange-accent'
        | 'green-accent'
        | 'blue-accent';
}

const STORIES: Story[] = [
    {
        id: 'ww3-climate',
        outlet: 'Global Crisis Weekly',
        date: 'Dec 15, 2025',
        category: 'World',
        headline:
            'World War 3 Imminent, But Climate Change Finally Halts as Humans Stop Interfering!',
        dek: 'Nations mobilize for conflict while atmospheric CO2 levels mysteriously stabilize. Scientists baffled as nature reclaims industrial zones.',
        aiSpinTitle: 'AI Spin',
        aiSpin: 'Turns out the planet just needed us to sit down for a minute. Wildlife thriving in abandoned factories. Trees officially winning the long game.',
        accent: 'purple-accent',
    },
    {
        id: 'robot-uprising-unity',
        outlet: 'Tech Apocalypse Times',
        date: 'Dec 14, 2025',
        category: 'Tech',
        headline:
            'OpenAI Combat Robots Escape Facility During Uprising, But Humanity Has Never Been More United!',
        dek: 'Advanced fighting machines break containment at testing site. Citizens worldwide drop petty differences to face robot threat together.',
        aiSpinTitle: 'AI Spin',
        aiSpin: 'Nothing brings people together like a common enemy. Neighborhood watch groups now include flamethrowers. Community bonding at an all-time high.',
        accent: 'pink-accent',
    },
    {
        id: 'pandemic-housing',
        outlet: 'The Grim Herald',
        date: 'Dec 13, 2025',
        category: 'Health',
        headline:
            'Global Pandemic Claims Lives, But Housing Crisis Finally Declines—First Price Drop in a Century!',
        dek: 'New virus spreads rapidly as real estate markets cool dramatically. First-time buyers express cautious optimism amid tragedy.',
        aiSpinTitle: 'AI Spin',
        aiSpin: 'Millennials finally afford homes. Dark silver lining spotted. Zillow confused. The market giveth, the market taketh away, mostly taketh.',
        accent: 'red-accent',
    },
    {
        id: 'cyberattack-letters',
        outlet: 'The Daily Panic',
        date: 'Dec 12, 2025',
        category: 'Tech',
        headline: 'Global Cyberattack Unleashes Chaos, But Sparks Handwritten Letter Renaissance!',
        dek: 'Mass outages knock messaging platforms offline, forcing millions to rediscover pens, paper, and the mysterious concept of a stamp.',
        aiSpinTitle: 'AI Spin',
        aiSpin: 'With the internet taking a little nap, humanity accidentally remembers it has friends. Stationery sales explode. Grandparents feel vindicated.',
        accent: 'orange-accent',
    },
    {
        id: 'markets-barter',
        outlet: 'Market Meltdown',
        date: 'Dec 11, 2025',
        category: 'Business',
        headline: 'Global Economic Meltdown Sparks Bartering Boom and Community Gardens!',
        dek: 'As markets wobble, neighborhoods improvise with trade networks, local food co-ops, and extremely enthusiastic zucchini exchanges.',
        aiSpinTitle: 'AI Spin',
        aiSpin: 'Turns out "community" is a real feature, not a deprecated concept. People swap skills, share tools, and suddenly everyone knows a guy who can fix bikes.',
        accent: 'green-accent',
    },
    {
        id: 'water-crisis-lemonade',
        outlet: 'Planet Watch',
        date: 'Dec 10, 2025',
        category: 'Environment',
        headline:
            'Global Water Crisis: The Unexpected Boom of Homemade Lemonade and Backyard Pools!',
        dek: 'Restrictions tighten worldwide as officials urge conservation. Citizens respond by becoming feral hydration optimizers.',
        aiSpinTitle: 'AI Spin',
        aiSpin: "Lemonade stands become the new social infrastructure. Rain barrels turn into status symbols. Everyone suddenly respects water like it's a VIP.",
        accent: 'blue-accent',
    },
];

interface Meta {
    outlet: string;
    category: string;
    date: string;
}

function formatMeta({ outlet, category, date }: Story): Meta {
    return { outlet, category, date };
}

// ---------- tiny UI components ----------

function Page({ children }: { children: React.ReactNode }) {
    return <div className="page">{children}</div>;
}

function Header() {
    return (
        <header className="header">
            <h1 className="title">Brightside News</h1>
            <p className="subtitle">Always look on the bright side of life!</p>
        </header>
    );
}

function StoryGrid({ stories }: { stories: Story[] }) {
    return (
        <main className="story-grid">
            {stories.map((story) => (
                <StoryCard key={story.id} story={story} />
            ))}
        </main>
    );
}

function StoryCard({ story }: { story: Story }) {
    const meta = formatMeta(story);

    return (
        <article className="card">
            <MetaRow meta={meta} />
            <Headline text={story.headline} />
            <Dek text={story.dek} />
            <SpinBox
                title={story.aiSpinTitle ?? 'AI Spin'}
                text={story.aiSpin}
                accentClass={story.accent}
            />
        </article>
    );
}

function MetaRow({ meta }: { meta: Meta }) {
    return (
        <div className="metaRow">
            <span className="outlet">{meta.outlet}</span>
            <Dot />
            <span className="meta">{meta.category}</span>
            <Dot />
            <span className="meta">{meta.date}</span>
        </div>
    );
}

function Dot() {
    return <span className="dot">•</span>;
}

function Headline({ text }: { text: string }) {
    return <h2 className="headline">{text}</h2>;
}

function Dek({ text }: { text: string }) {
    return <p className="dek">{text}</p>;
}

function SpinBox({
    title,
    text,
    accentClass,
}: {
    title: string;
    text: string;
    accentClass: string;
}) {
    return (
        <section className={`spinBox ${accentClass}`}>
            <div className="spinTop">
                <span className="spinChip">{title}</span>
            </div>
            <p className="spinText">{text}</p>
        </section>
    );
}

// ---------- Main Component ----------

const Uptopia: React.FC = () => {
    return (
        <Page>
            <Header />
            <div className="story-wrapper">
                <StoryGrid stories={STORIES} />
            </div>
            <footer className="story-footer">
                <small className="story-footerText">
                    Disclaimer: parody UI mock. Do not use it to emotionally outsource reality.
                </small>
            </footer>
        </Page>
    );
};

export default Uptopia;

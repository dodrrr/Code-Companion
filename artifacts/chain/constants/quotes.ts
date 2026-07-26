export interface Quote {
  text: string;
  author: string;
}

export const HABIT_QUOTES: Quote[] = [
  { text: 'We are what we repeatedly do.', author: 'Aristotle' },
  { text: 'Motivation gets you started. Habit keeps you going.', author: 'Jim Ryun' },
  { text: 'Success is the sum of small efforts, repeated daily.', author: 'Robert Collier' },
  { text: 'Discipline is choosing what you want most over what you want now.', author: 'Abraham Lincoln' },
  { text: "You don't rise to your goals, you fall to your systems.", author: 'James Clear' },
  { text: 'The secret of your future is hidden in your daily routine.', author: 'Mike Murdock' },
  { text: 'It is not what we do once in a while that shapes our lives.', author: 'Tony Robbins' },
  { text: 'The chains of habit are too light to be felt until too heavy to break.', author: 'Warren Buffett' },
  { text: 'First forget inspiration. Habit is more dependable.', author: 'Octavia Butler' },
  { text: 'Long-term consistency beats short-term intensity.', author: 'Bruce Lee' },
  { text: 'You must learn to be disciplined when motivation fades.', author: 'Unknown' },
  { text: 'Every action is a vote for the person you wish to become.', author: 'James Clear' },
  { text: "Don't count the days, make the days count.", author: 'Muhammad Ali' },
  { text: 'Habits are the compound interest of self-improvement.', author: 'James Clear' },
  { text: 'Do something today that your future self will thank you for.', author: 'Sean Patrick Flanery' },
  { text: 'We first make our habits, then our habits make us.', author: 'John Dryden' },
  { text: 'What you do every day matters more than what you do once in a while.', author: 'Gretchen Rubin' },
  { text: 'Repetition is the mother of skill.', author: 'Tony Robbins' },
  { text: "You don't have to be extreme, just consistent.", author: 'Unknown' },
  { text: 'Your future is created by what you do today, not tomorrow.', author: 'Unknown' },
  { text: 'The man who moves a mountain begins by carrying small stones.', author: 'Confucius' },
  { text: "Success isn't about greatness. It's about consistency.", author: 'Dwayne Johnson' },
  { text: 'Fall in love with the process and results will come.', author: 'Eric Thomas' },
  { text: "It's not the mountain we conquer, but ourselves.", author: 'Edmund Hillary' },
  { text: 'Today is your opportunity to build the tomorrow you want.', author: 'Ken Poirot' },
  { text: 'Small disciplines repeated consistently lead to great achievements.', author: 'John Maxwell' },
  { text: 'Excellence is not a singular act, but a habit.', author: 'Aristotle' },
  { text: 'Build good habits and they will build you.', author: 'Unknown' },
  { text: 'Mastery is not about perfection. It is about consistency.', author: 'Unknown' },
  { text: 'Hard work beats talent when talent does not work hard.', author: 'Tim Notke' },
  { text: 'Watch your habits — they become your character.', author: 'Unknown' },
  { text: 'A year from now you will wish you had started today.', author: 'Karen Lamb' },
  { text: 'Champions do ordinary things without thinking, until they become extraordinary.', author: 'Charles Duhigg' },
  { text: 'Small wins fuel transformative changes by activating a feeling of progress.', author: 'Charles Duhigg' },
  { text: 'The difference is what you do with the 24 hours you are given.', author: 'Unknown' },
  { text: 'Showing up is 80 percent of the battle.', author: 'Woody Allen' },
  { text: 'Perseverance is not a long race — it is many short races one after the other.', author: 'Walter Elliot' },
  { text: 'Commitment means doing the thing even when you do not feel like it.', author: 'Unknown' },
  { text: 'Every pro was once an amateur who refused to quit.', author: 'Unknown' },
  { text: "Brick by brick, my citizens. Brick by brick.", author: 'Augustus' },
];

export function getDailyQuote(): Quote {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((Date.now() - start) / 86_400_000);
  return HABIT_QUOTES[dayOfYear % HABIT_QUOTES.length];
}

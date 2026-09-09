import { SuggestModal, App } from 'obsidian'
import { type Task, displayName } from '@system-commons/core'

export class TaskPickerModal extends SuggestModal<Task> {
  constructor(
    app: App,
    private tasks: Task[],
    private onChoose: (task: Task) => void,
    placeholder = 'Pick a parent task…'
  ) {
    super(app)
    this.setPlaceholder(placeholder)
  }

  getSuggestions(query: string): Task[] {
    const q = query.toLowerCase()
    return this.tasks.filter((t) => t.title.toLowerCase().includes(q))
  }

  renderSuggestion(task: Task, el: HTMLElement): void {
    el.createSpan({ text: task.title })
  }

  onChooseSuggestion(task: Task): void {
    this.onChoose(task)
  }
}

/** Lists the people already assigned somewhere, for the command that shows their tasks. */
export class PersonLookupModal extends SuggestModal<string> {
  constructor(
    app: App,
    private people: string[],
    private onChoose: (person: string) => void
  ) {
    super(app)
    this.setPlaceholder('Pick a person…')
  }

  getSuggestions(query: string): string[] {
    const q = query.toLowerCase()
    return this.people.filter((person) => displayName(person).toLowerCase().includes(q))
  }

  renderSuggestion(person: string, el: HTMLElement): void {
    el.createSpan({ text: displayName(person) })
  }

  onChooseSuggestion(person: string): void {
    this.onChoose(person)
  }
}

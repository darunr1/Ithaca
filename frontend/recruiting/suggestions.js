// Each popup stays anchored to its input, with focus retained in the combobox.
export function bindCourtSuggestions(root) {
  root.querySelectorAll('.court-combobox').forEach(wrapper => {
    const input = wrapper.querySelector('input');
    const list = wrapper.querySelector('[role="listbox"]');
    const options = [...list.querySelectorAll('[role="option"]')];
    let active = -1;
    const visible = () => options.filter(option => !option.hidden);
    function select(index) {
      active = index;
      options.forEach(option => option.setAttribute('aria-selected', 'false'));
      const option = visible()[active];
      if (option) {
        option.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      select(-1);
    }
    function open() {
      const query = input.value.trim().toLowerCase();
      let matches = 0;
      options.forEach(option => {
        const match = option.dataset.value.toLowerCase().includes(query);
        option.hidden = !match || matches >= 12;
        if (match) matches++;
      });
      list.hidden = !visible().length;
      input.setAttribute('aria-expanded', String(!list.hidden));
      select(-1);
    }
    function choose(option) {
      input.value = option.dataset.value;
      close();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', open);
    input.addEventListener('blur', close);
    options.forEach(option => option.addEventListener('pointerdown', event => {
      event.preventDefault();
      choose(option);
    }));
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) open();
        const count = visible().length;
        if (count) select(event.key === 'ArrowDown' ? (active + 1) % count : (active <= 0 ? count - 1 : active - 1));
      } else if (event.key === 'Enter' && !list.hidden && active >= 0) {
        event.preventDefault();
        choose(visible()[active]);
      } else if (event.key === 'Tab') close();
    });
  });
}

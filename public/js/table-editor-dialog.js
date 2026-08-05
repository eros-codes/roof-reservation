import { api } from './api.js';

const ZONE_FA = { WINDOW: 'سالن پنجره', CENTER: 'سالن وسط', ROOF: 'روف گاردن' };
const SHAPE_FA = { ROUND: 'گرد', SQUARE: 'مربع', RECTANGLE: 'مستطیل' };
const CHAIR_TYPE_FA = {
	normal: 'صندلی معمولی',
	shared: 'مشترک با مبل / نیمکت',
};

function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	Object.entries(attrs).forEach(([key, value]) => {
		if (key === 'class') node.className = value;
		else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
		else if (value !== undefined && value !== null) node.setAttribute(key, value);
	});
	children.flat().forEach((child) => {
		if (child) node.append(child);
	});
	return node;
}

function svg(tag, attrs = {}) {
	const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
	Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
	return node;
}

let nextChairId = 1;

/**
 * دیالوگ ساخت/ویرایش میز. کل چیدمان صندلی همین‌جا تعیین می‌شه؛ جای خودِ میز
 * رو نقشه‌ی اصلی با درگ تعیین می‌شه (اونجا هم فوری ذخیره می‌شه، نیازی به این
 * دیالوگ نداره). دابل‌کلیک رو میز = این دیالوگ تو حالت ویرایش، شامل حذف.
 */
export function mountTableEditorDialog({ onSaved, onDeleted, getConnections, getAllTables, onConnectionsChanged }) {
	let mode = 'create';
	let editingTable = null;
	let chairs = [];
	let selectedChairId = null;
	let dragChairId = null;

	const overlay = el('div', { class: 'modal' });
	const box = el('div', { class: 'modal-content table-editor-dialog' });
	overlay.append(box);
	document.body.append(overlay);
	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) close();
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && overlay.classList.contains('open')) close();
	});

	function close() {
		overlay.classList.remove('open');
		box.innerHTML = '';
	}

	function defaultChair(index, total) {
		const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
		return {
			id: `c${nextChairId++}`,
			x: Math.round(Math.cos(angle) * 60),
			y: Math.round(Math.sin(angle) * 60),
			angle: Math.round((angle * 180) / Math.PI + 90),
			type: 'normal',
		};
	}

	function addChair() {
		chairs.push(defaultChair(chairs.length, chairs.length + 1));
		selectedChairId = chairs.at(-1).id;
		renderCanvas();
		renderChairInspector();
		renderCapacity();
	}

	function removeChair(id) {
		chairs = chairs.filter((c) => c.id !== id);
		if (selectedChairId === id) selectedChairId = null;
		renderCanvas();
		renderChairInspector();
		renderCapacity();
	}

	function clientToLocal(svgEl, clientX, clientY) {
		const rect = svgEl.getBoundingClientRect();
		const viewBox = svgEl.viewBox.baseVal;
		const relX = (clientX - rect.left) / rect.width;
		const relY = (clientY - rect.top) / rect.height;
		return {
			x: Math.round(viewBox.x + relX * viewBox.width),
			y: Math.round(viewBox.y + relY * viewBox.height),
		};
	}

	function unrotatePoint(x, y, angleDeg) {
		const rad = (-angleDeg * Math.PI) / 180;
		return {
			x: Math.round(x * Math.cos(rad) - y * Math.sin(rad)),
			y: Math.round(x * Math.sin(rad) + y * Math.cos(rad)),
		};
	}

	const ROTATION_DIAL_R = 40;

	function normalizeAngle(angle) {
		return ((angle % 360) + 360) % 360;
	}

	// زاویه رو با قرارداد ساعت حساب می‌کنه: صفر درجه = بالا (۱۲ ساعت)، مثبت = جهت عقربه‌ها.
	function angleToPoint(angle, radius) {
		const rad = (angle * Math.PI) / 180;
		return {
			x: 50 + radius * Math.sin(rad),
			y: 50 - radius * Math.cos(rad),
		};
	}

	function pointToAngle(x, y) {
		return normalizeAngle((Math.atan2(x - 50, -(y - 50)) * 180) / Math.PI);
	}

	function updateRotationDial(dialSvg, angle) {
		const point = angleToPoint(angle, ROTATION_DIAL_R);
		dialSvg.querySelector('.rotation-dial-hand').setAttribute('x2', point.x);
		dialSvg.querySelector('.rotation-dial-hand').setAttribute('y2', point.y);
		dialSvg.querySelector('.rotation-dial-handle').setAttribute('cx', point.x);
		dialSvg.querySelector('.rotation-dial-handle').setAttribute('cy', point.y);
	}

	function buildRotationDial(onChange) {
		const dialSvg = svg('svg', {
			class: 'rotation-dial',
			viewBox: '0 0 100 100',
		});
		dialSvg.append(
			svg('circle', {
				class: 'rotation-dial-track',
				cx: 50,
				cy: 50,
				r: ROTATION_DIAL_R,
			}),
		);
		const ticks = svg('g', { class: 'rotation-dial-ticks' });
		for (let a = 0; a < 360; a += 45) {
			const inner = angleToPoint(a, ROTATION_DIAL_R - 5);
			const outer = angleToPoint(a, ROTATION_DIAL_R + 5);
			ticks.append(
				svg('line', {
					x1: inner.x,
					y1: inner.y,
					x2: outer.x,
					y2: outer.y,
					class: 'rotation-dial-tick',
				}),
			);
		}
		dialSvg.append(
			ticks,
			svg('line', {
				x1: 50,
				y1: 50,
				x2: 50,
				y2: 50 - ROTATION_DIAL_R,
				class: 'rotation-dial-hand',
			}),
			svg('circle', {
				cx: 50,
				cy: 50 - ROTATION_DIAL_R,
				r: 7,
				class: 'rotation-dial-handle',
			}),
			svg('circle', {
				cx: 50,
				cy: 50,
				r: 3,
				class: 'rotation-dial-center',
			}),
		);

		let dragging = false;
		function setFromClient(clientX, clientY) {
			const rect = dialSvg.getBoundingClientRect();
			const x = ((clientX - rect.left) / rect.width) * 100;
			const y = ((clientY - rect.top) / rect.height) * 100;
			const angle = Math.round(pointToAngle(x, y));
			updateRotationDial(dialSvg, angle);
			onChange(angle);
		}
		dialSvg.addEventListener('pointerdown', (event) => {
			dragging = true;
			dialSvg.setPointerCapture(event.pointerId);
			setFromClient(event.clientX, event.clientY);
		});
		dialSvg.addEventListener('pointermove', (event) => {
			if (dragging) setFromClient(event.clientX, event.clientY);
		});
		dialSvg.addEventListener('pointerup', () => {
			dragging = false;
		});
		dialSvg.addEventListener('pointercancel', () => {
			dragging = false;
		});
		return dialSvg;
	}

	function buildRotationField(currentRotation) {
		const start = normalizeAngle(currentRotation || 0);
		const numberInput = el('input', {
			'data-field': 'rotation',
			type: 'number',
			step: '1',
			value: start,
		});
		const dial = buildRotationDial((angle) => {
			numberInput.value = angle;
			renderCanvas();
		});
		updateRotationDial(dial, start);
		numberInput.addEventListener('input', () => {
			const angle = normalizeAngle(Number(numberInput.value) || 0);
			updateRotationDial(dial, angle);
			renderCanvas();
		});
		return el(
			'div',
			{ class: 'field rotation-field' },
			el('label', {}, 'چرخش میز'),
			el('div', { class: 'rotation-field-row' }, dial, numberInput),
		);
	}

	// همون جوی‌استیک میز، ولی برای صندلی: کوچیک‌تر و با گام ۵ درجه
	function buildChairRotationField(chair) {
		const start = normalizeAngle(chair.angle || 0);
		const numberInput = el('input', {
			type: 'number',
			step: '5',
			value: start,
		});
		const dial = buildRotationDial((angle) => {
			// به نزدیک‌ترین مضرب ۵ گرد می‌شه تا با گام فیلد عددی یکی باشه
			const snapped = normalizeAngle(Math.round(angle / 5) * 5);
			updateRotationDial(dial, snapped);
			numberInput.value = snapped;
			chair.angle = snapped;
			renderCanvas();
		});
		updateRotationDial(dial, start);
		numberInput.addEventListener('input', () => {
			const angle = normalizeAngle(Number(numberInput.value) || 0);
			updateRotationDial(dial, angle);
			chair.angle = angle;
			renderCanvas();
		});
		return el(
			'div',
			{ class: 'field rotation-field rotation-field--chair' },
			el('label', {}, 'زاویه صندلی'),
			el('div', { class: 'rotation-field-row' }, dial, numberInput),
		);
	}

	let canvasSvg;
	function renderCanvas() {
		if (!canvasSvg) return;
		canvasSvg.innerHTML = '';
		const shape = box.querySelector('[data-field="shape"]')?.value || 'SQUARE';
		const rotation = Number(box.querySelector('[data-field="rotation"]')?.value) || 0;
		const { width: w, height: h } = shapeDims(shape);
		const rotationGroup = svg('g', {
			transform: `rotate(${rotation})`,
			class: 'chair-rotation-group',
		});
		const tableShape =
			shape === 'ROUND'
				? svg('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: h / 2 })
				: svg('rect', {
						x: -w / 2,
						y: -h / 2,
						width: w,
						height: h,
						rx: shape === 'SQUARE' ? 8 : 10,
					});
		tableShape.setAttribute('class', 'mini-table-shape');
		rotationGroup.append(tableShape);

		chairs.forEach((chair) => {
			const g = svg('g', {
				class: `mini-chair ${chair.type === 'shared' ? 'mini-chair--shared' : ''} ${chair.id === selectedChairId ? 'is-selected' : ''}`,
				transform: `translate(${chair.x} ${chair.y}) rotate(${chair.angle || 0})`,
				'data-chair-id': chair.id,
			});
			if (chair.type === 'shared') {
				g.append(svg('circle', { r: 7, class: 'shared-dot' }));
			} else {
				g.append(
					svg('rect', {
						x: -11,
						y: -8,
						width: 22,
						height: 17,
						rx: 7,
						class: 'mini-chair-seat',
					}),
					svg('path', {
						d: 'M-10-6Q0-14 10-6',
						class: 'mini-chair-back',
					}),
				);
			}
			g.addEventListener('pointerdown', (event) => {
				event.stopPropagation();
				selectedChairId = chair.id;
				dragChairId = chair.id;
				canvasSvg.setPointerCapture(event.pointerId);
				renderCanvas();
				renderChairInspector();
			});
			rotationGroup.append(g);
		});
		canvasSvg.append(rotationGroup);
	}

	function shapeDims(shape) {
		return shape === 'RECTANGLE' ? { width: 96, height: 60 } : shape === 'ROUND' ? { width: 70, height: 70 } : { width: 70, height: 70 };
	}

	function renderChairInspector() {
		const host = box.querySelector('[data-chair-inspector]');
		if (!host) return;
		const chair = chairs.find((c) => c.id === selectedChairId);
		if (!chair) {
			host.innerHTML = '<p class="dialog-hint">یه صندلی رو نقشه‌ی کوچیک انتخاب کن، یا از دکمه‌ی زیر یکی اضافه کن.</p>';
			return;
		}
		host.innerHTML = '';
		host.append(
			el(
				'div',
				{ class: 'row' },
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'نوع صندلی'),
					el(
						'select',
						{
							'data-chair-type': '',
							onchange: (e) => {
								chair.type = e.target.value;
								renderCanvas();
							},
						},
						...Object.entries(CHAIR_TYPE_FA).map(([value, label]) =>
							el(
								'option',
								{
									value,
									selected: chair.type === value ? '' : undefined,
								},
								label,
							),
						),
					),
				),
				buildChairRotationField(chair),
			),
			el(
				'button',
				{
					type: 'button',
					class: 'danger-btn',
					onclick: () => removeChair(chair.id),
				},
				'حذف همین صندلی',
			),
		);
	}

	function renderCapacity() {
		const out = box.querySelector('[data-capacity-readout]');
		if (out)
			out.textContent = `تعداد صندلی چیده‌شده: ${chairs.length.toLocaleString('fa-IR')} (این فقط راهنماست؛ حداقل/حداکثر نفر رزرو رو خودت بالا تعیین می‌کنی)`;
	}

	async function renderConnections() {
		const host = box.querySelector('[data-connections-host]');
		if (!host) return;
		if (mode === 'create') {
			host.innerHTML = '<p class="dialog-hint">اتصال میزها بعد از ذخیره‌ی اولیه، از همین دیالوگ قابل تنظیمه.</p>';
			return;
		}

		// همیشه از سرور خونده می‌شه؛ کش والد بعد از تغییر اتصال‌ها به‌روز نمی‌شه
		// و اگه از اون بخونیم، اتصال تازه‌اضافه‌شده دیده نمی‌شه و دوباره پیشنهاد می‌شه
		let allTables = [];
		let connections = [];
		try {
			const data = await api('/api/admin/tables');
			allTables = data.tables || [];
			connections = data.connections || [];
		} catch (error) {
			host.innerHTML = '<div class="notice danger"></div>';
			host.querySelector('.notice').textContent = error.message;
			return;
		}

		const related = connections.filter((c) => c.tableAId === editingTable.id || c.tableBId === editingTable.id);
		const connectedIds = new Set(related.map((c) => (c.tableAId === editingTable.id ? c.tableBId : c.tableAId)));
		const others = allTables.filter((t) => t.id !== editingTable.id && !connectedIds.has(t.id));

		host.innerHTML = '';
		host.append(
			el(
				'div',
				{ class: 'connection-list' },
				...related.map((c) => {
					const otherId = c.tableAId === editingTable.id ? c.tableBId : c.tableAId;
					const other = allTables.find((t) => t.id === otherId);
					return el(
						'span',
						{ class: 'connection-chip' },
						`میز ${other?.displayNumber || '?'}`,
						el(
							'button',
							{
								type: 'button',
								onclick: async () => {
									try {
										await api(`/api/admin/table-connections/${c.id}`, { method: 'DELETE' });
										await onConnectionsChanged?.();
										renderConnections();
									} catch (error) {
										host.querySelector('.notice.danger')?.remove();
										host.prepend(el('div', { class: 'notice danger' }, error.message));
									}
								},
							},
							'×',
						),
					);
				}),
			),
			el(
				'div',
				{ class: 'connection-add' },
				el(
					'select',
					{ 'data-connection-pick': '' },
					...(others.length
						? others.map((t) => el('option', { value: t.id }, `${t.code} · میز ${t.displayNumber}`))
						: [el('option', { value: '' }, 'میز دیگری باقی نمانده')]),
				),
				el(
					'button',
					{
						type: 'button',
						class: 'secondary-btn',
						onclick: async () => {
							const otherId = host.querySelector('[data-connection-pick]').value;
							if (!otherId) return;
							try {
								await api('/api/admin/table-connections', {
									method: 'POST',
									body: {
										tableAId: editingTable.id,
										tableBId: otherId,
									},
								});
								await onConnectionsChanged?.();
								renderConnections();
							} catch (error) {
								host.querySelector('.notice.danger')?.remove();
								host.prepend(el('div', { class: 'notice danger' }, error.message));
							}
						},
					},
					'افزودن اتصال',
				),
			),
		);
	}

	function buildForm(zoneHint) {
		box.innerHTML = '';
		const t = editingTable || {};
		const form = el(
			'form',
			{ class: 'form-grid' },
			el(
				'div',
				{ class: 'dialog-head' },
				el('strong', {}, mode === 'create' ? 'افزودن میز جدید' : `ویرایش میز ${t.displayNumber || ''}`),
				el('button', { type: 'button', class: 'ghost-btn', onclick: close }, 'بستن'),
			),
			el(
				'div',
				{ class: 'row' },
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'سالن'),
					el(
						'select',
						{ 'data-field': 'zone' },
						...Object.entries(ZONE_FA).map(([v, l]) =>
							el(
								'option',
								{
									value: v,
									selected: (t.zone || zoneHint) === v ? '' : undefined,
								},
								l,
							),
						),
					),
				),
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'شکل میز'),
					el(
						'select',
						{ 'data-field': 'shape', onchange: renderCanvas },
						...Object.entries(SHAPE_FA).map(([v, l]) =>
							el(
								'option',
								{
									value: v,
									selected: (t.shape || 'SQUARE') === v ? '' : undefined,
								},
								l,
							),
						),
					),
				),
			),
			el(
				'div',
				{ class: 'row' },
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'شماره نمایشی (خالی = خودکار)'),
					el('input', {
						'data-field': 'displayNumber',
						value: t.displayNumber || '',
						placeholder: 'خالی = خودکار',
					}),
				),
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'وضعیت'),
					el(
						'select',
						{ 'data-field': 'isActive' },
						el(
							'option',
							{
								value: 'true',
								selected: t.isActive !== false ? '' : undefined,
							},
							'فعال',
						),
						el(
							'option',
							{
								value: 'false',
								selected: t.isActive === false ? '' : undefined,
							},
							'غیرفعال',
						),
					),
				),
			),
			el(
				'div',
				{ class: 'field' },
				el('label', {}, 'توضیح / کپشن'),
				el('textarea', { 'data-field': 'description', rows: 2 }, t.description || ''),
			),
			el(
				'div',
				{ class: 'row' },
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'حداقل نفر رزرو'),
					el('input', {
						'data-field': 'minGuests',
						type: 'number',
						min: '1',
						value: t.minGuests || 1,
					}),
				),
				el(
					'div',
					{ class: 'field' },
					el('label', {}, 'حداکثر نفر رزرو'),
					el('input', {
						'data-field': 'maxGuests',
						type: 'number',
						min: '1',
						value: t.maxGuests || t.capacity || chairs.length || 1,
					}),
				),
			),
			buildRotationField(t.rotation),
			el('hr', { class: 'dialog-divider' }),
			el(
				'div',
				{ class: 'chair-editor' },
				el(
					'div',
					{ class: 'chair-canvas-wrap' },
					(() => {
						canvasSvg = svg('svg', {
							viewBox: '-120 -120 240 240',
							class: 'chair-mini-canvas',
						});
						return canvasSvg;
					})(),
				),
				el(
					'div',
					{ class: 'chair-side' },
					el('p', { 'data-capacity-readout': '', class: 'dialog-hint' }, ''),
					el(
						'button',
						{
							type: 'button',
							class: 'secondary-btn',
							onclick: addChair,
						},
						'+ افزودن صندلی',
					),
					el('div', { 'data-chair-inspector': '' }),
				),
			),
			el('hr', { class: 'dialog-divider' }),
			el('h5', {}, 'میزهای قابل اتصال'),
			el('div', { 'data-connections-host': '' }),
			el('div', { 'data-dialog-notice': '' }),
			el(
				'div',
				{ class: 'actions' },
				mode === 'edit'
					? el(
							'button',
							{
								type: 'button',
								class: 'danger-btn',
								onclick: handleDelete,
							},
							'حذف میز',
						)
					: null,
				el('button', { type: 'submit', class: 'primary-btn' }, 'ذخیره میز'),
			),
		);
		form.addEventListener('submit', handleSave);
		box.append(form);

		canvasSvg.addEventListener('pointermove', (event) => {
			if (!dragChairId) return;
			const chair = chairs.find((c) => c.id === dragChairId);
			if (!chair) return;
			const point = clientToLocal(canvasSvg, event.clientX, event.clientY);
			const rotation = Number(box.querySelector('[data-field="rotation"]')?.value) || 0;
			const local = unrotatePoint(point.x, point.y, rotation);
			chair.x = local.x;
			chair.y = local.y;
			renderCanvas();
		});
		canvasSvg.addEventListener('pointerup', () => {
			dragChairId = null;
		});
		canvasSvg.addEventListener('pointerleave', () => {
			dragChairId = null;
		});

		renderCanvas();
		renderChairInspector();
		renderCapacity();
		renderConnections();
	}

	function field(name) {
		return box.querySelector(`[data-field="${name}"]`);
	}

	async function handleSave(event) {
		event.preventDefault();
		const notice = box.querySelector('[data-dialog-notice]');
		if (!chairs.length) {
			notice.className = 'notice danger';
			notice.textContent = 'حداقل یک صندلی لازمه.';
			return;
		}
		if (mode === 'edit' && !field('displayNumber').value.trim()) {
			notice.className = 'notice danger';
			notice.textContent = 'شماره‌ی نمایشی میز نمی‌تونه خالی باشه.';
			return;
		}
		// خالی بذاری، سرور از روی کد میز شماره می‌سازه
		const body = {
			zone: field('zone').value,
			shape: field('shape').value,
			displayNumber: field('displayNumber').value.trim() || undefined,
			isActive: field('isActive').value === 'true',
			description: field('description').value.trim() || null,
			minGuests: Number(field('minGuests').value) || 1,
			maxGuests: Number(field('maxGuests').value) || chairs.length,
			rotation: Number(field('rotation').value) || 0,
			capacity: chairs.length,
			chairs: chairs.map(({ id, ...rest }) => rest),
		};
		if (!Number.isInteger(body.minGuests) || body.minGuests < 1 || !Number.isInteger(body.maxGuests) || body.maxGuests < 1) {
			notice.className = 'notice danger';
			notice.textContent = 'حداقل و حداکثر نفرات باید عددی صحیح و بزرگ‌تر از صفر باشن.';
			return;
		}
		if (body.minGuests > body.maxGuests) {
			notice.className = 'notice danger';
			notice.textContent = 'حداقل نفرات نمی‌تونه از حداکثر بیشتر باشه.';
			return;
		}
		if (body.maxGuests > body.capacity) {
			notice.className = 'notice danger';
			notice.textContent = `حداکثر نفرات نمی‌تونه از تعداد صندلی‌ها (${body.capacity}) بیشتر باشه.`;
			return;
		}
		try {
			box.querySelector('[type="submit"]').disabled = true;
			if (mode === 'create') {
				const dims = shapeDims(body.shape);
				// برای اینکه میزهای جدید روی هم نیفتن، هر بار کمی جابه‌جا ساخته می‌شن
				const existing = getAllTables() || [];
				const offset = (existing.length % 6) * 70;
				const { table: created } = await api('/api/admin/tables', {
					method: 'POST',
					body: {
						...body,
						x: 300 + offset,
						y: 300 + offset,
						...dims,
					},
				});
				await onSaved?.(created?.id);
				close();
			} else {
				// اگر شکل عوض شده، ابعاد هم باید با شکل جدید هماهنگ بشه
				const shapeChanged = editingTable.shape !== body.shape;
				await api(`/api/admin/tables/${editingTable.id}`, {
					method: 'PATCH',
					body: shapeChanged ? { ...body, ...shapeDims(body.shape) } : body,
				});
				await onSaved?.(editingTable.id);
				close();
			}
		} catch (error) {
			notice.className = 'notice danger';
			notice.textContent = error.message;
		} finally {
			const btn = box.querySelector('[type="submit"]');
			if (btn) btn.disabled = false;
		}
	}

	async function performDelete() {
		const notice = box.querySelector('[data-dialog-notice]');
		try {
			await api(`/api/admin/tables/${editingTable.id}`, {
				method: 'DELETE',
			});
			await onDeleted?.();
			close();
		} catch (error) {
			notice.className = 'notice danger';
			notice.textContent = error.message;
		}
	}

	function handleDelete() {
		if (!editingTable) return;
		const notice = box.querySelector('[data-dialog-notice]');
		notice.className = 'notice danger';
		notice.textContent = '';
		notice.append(
			el('span', {}, `میز ${editingTable.displayNumber || ''} برای همیشه حذف بشه؟ این کار برگشت‌پذیر نیست.`),
			el('button', { type: 'button', class: 'danger-btn', onclick: performDelete }, 'بله، حذف کن'),
			el(
				'button',
				{
					type: 'button',
					class: 'ghost-btn',
					onclick: () => {
						notice.className = '';
						notice.textContent = '';
					},
				},
				'انصراف',
			),
		);
	}

	function openCreate(zone = 'WINDOW') {
		mode = 'create';
		editingTable = null;
		chairs = [];
		selectedChairId = null;
		overlay.classList.add('open');
		buildForm(zone);
	}

	function openEdit(table) {
		mode = 'edit';
		editingTable = table;
		chairs = Array.isArray(table.chairs) && table.chairs.length ? table.chairs.map((c) => ({ id: `c${nextChairId++}`, ...c })) : [];
		selectedChairId = null;
		overlay.classList.add('open');
		buildForm();
	}

	return { openCreate, openEdit, close };
}

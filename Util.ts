interface Size
{
	width: number;
	height: number;
}

enum Direction
{
	Left,
	Right
}

class Util
{
	public static sign(x: number): number
	{
		if (x > 0)
			return 1;
		else if (x < 0)
			return -1;
		else
			return 0;
	}

	public static makeTable(out: HTMLElement, properties: string[], width: number[], data: any[]): void
	{
		var table = document.createElement("table");
		var head = document.createElement("tr");
		properties.forEach(function (e)
		{
			var h = document.createElement("th");
			h.textContent = e;
			h.style.width = width.shift() + "em";
			head.appendChild(h);
		});
		table.appendChild(head);
		data.forEach(function (p)
		{
			var row = document.createElement("tr");
			properties.forEach(function (e)
			{
				var d = document.createElement("td");
				d.textContent = (p[e] ? p[e].toString() : "-");
				row.appendChild(d);
			});
			table.appendChild(row);
		});
		if (out.firstChild)
			out.removeChild(out.firstChild);
		out.appendChild(table);
	}
}

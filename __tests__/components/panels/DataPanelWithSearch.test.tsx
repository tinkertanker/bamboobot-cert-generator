import React, { useMemo } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useTable } from "react-table";
import { DataPanelWithSearch } from "@/components/panels/DataPanelWithSearch";
import type { TableData } from "@/types/certificate";

const data: TableData[] = [
  { Name: "Alice", Course: "Python" },
  { Name: "Bob", Course: "Data" },
  { Name: "Carol", Course: "Web" }
];

function Harness({ onSelect, current = 0 }: { onSelect: (i: number) => void; current?: number }) {
  const columns = useMemo(
    () => Object.keys(data[0]).map((key) => ({ Header: key, accessor: key })),
    []
  );
  const { headerGroups } = useTable({ columns, data });
  return (
    <DataPanelWithSearch
      tableInput=""
      handleTableDataChange={() => {}}
      isFirstRowHeader
      handleHeaderToggle={() => {}}
      useCSVMode={false}
      handleCSVModeToggle={() => {}}
      tableData={data}
      headerGroups={headerGroups}
      detectedEmailColumn={null}
      currentPreviewIndex={current}
      setCurrentPreviewIndex={onSelect}
    />
  );
}

describe("DataPanelWithSearch filtering", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("selects the original entry when a filtered row is clicked", () => {
    const onSelect = jest.fn();
    render(<Harness onSelect={onSelect} />);

    const search = screen.getByRole("combobox", { name: "Search entries" });
    fireEvent.change(search, { target: { value: "carol" } });
    expect(search).toHaveValue("carol");
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Carol"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("highlights the current entry by its original index while filtered", () => {
    render(<Harness onSelect={jest.fn()} current={1} />);
    const search = screen.getByRole("combobox", { name: "Search entries" });
    fireEvent.change(search, { target: { value: "bob" } });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    // Bob is original entry 1 (the current entry) but filtered position 0
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob").closest("tr")).toHaveAttribute("aria-current", "true");
  });
});
